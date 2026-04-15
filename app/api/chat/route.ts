import type { NextRequest } from "next/server";
import { startChatStream, type ChatMessage } from "@/lib/claude";

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

  let stream;
  try {
    stream = startChatStream(messages);
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

      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send({ type: "delta", text: event.delta.text });
          }
        }

        const final = await stream.finalMessage();
        send({
          type: "done",
          usage: {
            input_tokens: final.usage.input_tokens,
            output_tokens: final.usage.output_tokens,
            cache_creation_input_tokens:
              final.usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens:
              final.usage.cache_read_input_tokens ?? 0,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
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
