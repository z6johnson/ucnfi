"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

export type BriefChatScope = {
  edition_id: string;
  item_id: string;
  headline: string;
  /** Pre-rendered anchor lines, e.g. ["ucop_systemwide.policy.has_genai_policy (silent)"]. */
  anchor_lines: string[];
};

type Props = {
  scope: BriefChatScope;
};

function buildScopedFirstMessage(scope: BriefChatScope, question: string): string {
  const lines: string[] = [];
  lines.push(`Context for this question: I'm reading the UC President's Brief, edition ${scope.edition_id}, item "${scope.headline}".`);
  if (scope.anchor_lines.length > 0) {
    lines.push("");
    lines.push("The brief anchors this item to:");
    for (const a of scope.anchor_lines) lines.push(`- ${a}`);
  }
  lines.push("");
  lines.push("Answer my next question in that context, grounded in the baseline and committee directory.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(question.trim());
  return lines.join("\n");
}

export function BriefInlineChat({ scope }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      setError(null);

      const isFirstTurn = messages.length === 0;
      const content = isFirstTurn ? buildScopedFirstMessage(scope, text) : text.trim();
      const nextMessages: Message[] = [
        ...messages,
        { role: "user", content },
      ];
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      setInput("");
      setStreaming(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(`Request failed (${res.status})${detail ? ": " + detail : ""}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const appendDelta = (delta: string) => {
          setMessages((prev) => {
            const copy = [...prev];
            const tail = copy[copy.length - 1];
            copy[copy.length - 1] = {
              role: tail.role,
              content: tail.content + delta,
            };
            return copy;
          });
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const event = JSON.parse(line.slice(6)) as StreamEvent;
                if (event.type === "delta") appendDelta(event.text);
                else if (event.type === "error") setError(event.error);
              } catch {
                // ignore malformed
              }
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setStreaming(false);
      }
    },
    [messages, streaming, scope],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  if (!open) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="starter-chip"
          style={{ fontSize: "var(--text-xs)" }}
        >
          Ask the copilot about this item ↓
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 hairline pt-4">
      <div className="flex items-center justify-between">
        <span className="label">Copilot · scoped to this item</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="label"
          style={{ color: "var(--color-text-subtle)", cursor: "pointer" }}
        >
          Hide
        </button>
      </div>

      {messages.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-4">
          {messages.map((msg, i) => {
            const isAssistant = msg.role === "assistant";
            const isLast = i === messages.length - 1;
            const empty = msg.content.length === 0;
            return (
              <li key={i} className={isAssistant ? "rail-accent" : ""}>
                <div className="label mb-1">
                  {isAssistant ? "Copilot" : "You"}
                </div>
                {empty && streaming && isLast ? (
                  <span
                    className="label"
                    style={{ color: "var(--color-text-subtle)" }}
                  >
                    Thinking…
                  </span>
                ) : isAssistant ? (
                  <div className="chat-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div
                    className="whitespace-pre-wrap text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {/* For the synthetic first turn we hide the scope
                        preamble and just show the user's actual question. */}
                    {i === 0 && msg.content.includes("\n---\n")
                      ? msg.content.split("\n---\n").pop()?.trim() ?? msg.content
                      : msg.content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p
          className="mt-3 text-xs"
          style={{ color: "var(--color-danger)" }}
        >
          {error}
        </p>
      ) : null}

      <form
        className="mt-3 flex items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          rows={2}
          placeholder="Drill into this item — try 'what does the baseline actually say?'"
          className="flex-1 resize-none bg-transparent text-sm focus:outline-none"
          style={{
            borderBottom: "1px solid var(--color-border-hair)",
            paddingBottom: "var(--space-2)",
            color: "var(--color-text)",
          }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="label"
          style={{
            color:
              streaming || !input.trim()
                ? "var(--color-text-subtle)"
                : "var(--color-accent)",
            cursor:
              streaming || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          {streaming ? "Streaming…" : "Send ↵"}
        </button>
      </form>
    </div>
  );
}
