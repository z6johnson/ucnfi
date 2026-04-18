import type { NextRequest } from "next/server";
import {
  providerChain,
  startChatStream,
  type ChatMessage,
  type Provider,
} from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Opus with the full baseline in the first (uncached) turn can easily
// exceed Vercel's 60s Hobby-plan default. 300s is the Pro-plan ceiling.
export const maxDuration = 300;

// If a provider hasn't produced a single text delta in this many ms,
// assume it's hung and fall through to the next provider in the chain.
const FIRST_TOKEN_STALL_MS = 20_000;

type Body = {
  messages?: ChatMessage[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "messages[] is required and must be non-empty" },
      { status: 400 },
    );
  }

  if (messages.at(-1)?.role !== "user") {
    return Response.json(
      { error: "The final message must have role 'user'" },
      { status: 400 },
    );
  }

  let chain: Provider[];
  try {
    chain = providerChain();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      let sentAnyDelta = false;
      let lastError: unknown = null;

      for (const provider of chain) {
        if (sentAnyDelta) break;
        const abortController = new AbortController();
        let stallTimer: ReturnType<typeof setTimeout> | null = setTimeout(
          () => {
            abortController.abort(
              new Error(
                `No first token from ${provider} within ${FIRST_TOKEN_STALL_MS}ms`,
              ),
            );
          },
          FIRST_TOKEN_STALL_MS,
        );
        const clearStallTimer = () => {
          if (stallTimer) {
            clearTimeout(stallTimer);
            stallTimer = null;
          }
        };
        try {
          const stream = startChatStream(
            messages,
            provider,
            abortController.signal,
          );
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              if (!sentAnyDelta) clearStallTimer();
              sentAnyDelta = true;
              send({ type: "delta", text: event.delta.text });
            }
          }
          clearStallTimer();

          try {
            const final = await stream.finalMessage();
            send({
              type: "done",
              provider,
              usage: {
                input_tokens: final.usage.input_tokens,
                output_tokens: final.usage.output_tokens,
                cache_creation_input_tokens:
                  final.usage.cache_creation_input_tokens ?? 0,
                cache_read_input_tokens:
                  final.usage.cache_read_input_tokens ?? 0,
              },
            });
          } catch (finalErr) {
            const finalMsg =
              finalErr instanceof Error ? finalErr.message : "Unknown error";
            console.error(
              `[chat] ${provider} finalMessage() failed: ${finalMsg}`,
            );
            send({
              type: "done",
              provider,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            });
          }
          lastError = null;
          break;
        } catch (err) {
          clearStallTimer();
          lastError = err;
          const message = err instanceof Error ? err.message : "Unknown error";
          if (sentAnyDelta) {
            send({ type: "error", provider, error: message });
            break;
          }
          console.error(`[chat] ${provider} failed: ${message}`);
        }
      }

      if (!sentAnyDelta && lastError) {
        const message =
          lastError instanceof Error ? lastError.message : "Unknown error";
        send({ type: "error", error: message });
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
