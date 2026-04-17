import type { NextRequest } from "next/server";
import {
  providerChain,
  startChatStream,
  type ChatMessage,
  type Provider,
} from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
        try {
          const stream = startChatStream(messages, provider);
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              sentAnyDelta = true;
              send({ type: "delta", text: event.delta.text });
            }
          }

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
          lastError = null;
          break;
        } catch (err) {
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
