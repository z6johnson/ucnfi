"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: Usage }
  | { type: "error"; error: string };

const STARTERS = [
  "Which UC campuses have a formal AI council, and which don't?",
  "Summarize differences between UCSD TritonAI and UCLA's OAI.",
  "Where are the biggest gaps in health AI governance across the UC health systems?",
  "Draft a one-page memo for OA-1 Trusted AI Standard that identifies three systemwide gaps.",
];

export function ChatStream({ knownEntityIds }: { knownEntityIds: string[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const knownIds = useMemo(() => new Set(knownEntityIds), [knownEntityIds]);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      setError(null);

      const nextMessages: Message[] = [
        ...messages,
        { role: "user", content: text.trim() },
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
          throw new Error(
            `Request failed (${res.status})${detail ? ": " + detail : ""}`,
          );
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
                else if (event.type === "done") setUsage(event.usage);
                else if (event.type === "error") setError(event.error);
              } catch {
                // ignore malformed line
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
    [messages, streaming],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      className={
        isEmpty
          ? "flex flex-col"
          : "flex h-[calc(100vh-220px)] min-h-[520px] flex-col"
      }
    >
      <div
        ref={logRef}
        className={
          isEmpty ? "" : "flex-1 overflow-y-auto pr-2"
        }
        aria-live="polite"
      >
        {isEmpty ? (
          <EmptyState onPick={(text) => void send(text)} />
        ) : (
          <ul className="flex flex-col gap-8">
            {messages.map((msg, i) => (
              <li key={i}>
                <div className="label mb-1">
                  {msg.role === "user" ? "You" : "Research copilot"}
                </div>
                <div
                  className="prose-body whitespace-pre-wrap"
                  style={{ color: "var(--color-text)" }}
                >
                  {msg.content ? (
                    <InlineCitations text={msg.content} knownIds={knownIds} />
                  ) : streaming && i === messages.length - 1 ? (
                    <span
                      className="label"
                      style={{ color: "var(--color-text-subtle)" }}
                    >
                      Thinking…
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <div
          className="rail-accent mt-4"
          style={{ borderLeftColor: "var(--color-danger)" }}
        >
          <span
            className="label"
            style={{ color: "var(--color-danger)" }}
          >
            Error
          </span>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            {error}
          </p>
        </div>
      ) : null}

      <form
        className="hairline mt-4 flex items-start gap-3 pt-4"
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
          placeholder="Ask a question grounded in the baseline…"
          className="flex-1 resize-none bg-transparent text-[var(--text-base)] focus:outline-none"
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
            color: streaming || !input.trim()
              ? "var(--color-text-subtle)"
              : "var(--color-accent)",
            cursor:
              streaming || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          {streaming ? "Streaming…" : "Send ↵"}
        </button>
      </form>

      <footer
        className="mt-3 flex items-center justify-between text-xs"
        style={{ color: "var(--color-text-subtle)" }}
      >
        <span>Shift+Enter inserts a newline. Chat history is not yet persisted.</span>
        {usage ? (
          <span>
            {usage.cache_read_input_tokens.toLocaleString()} cached ·{" "}
            {usage.output_tokens.toLocaleString()} out
          </span>
        ) : null}
      </footer>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div>
      <p
        className="prose-body max-w-xl"
        style={{ color: "var(--color-text-muted)" }}
      >
        Ask anything grounded in the UCNFI baseline. The copilot cites
        every factual claim back to a specific entity — click any
        citation chip in a response to open that entity in the explorer.
      </p>
      <div className="mt-6">
        <div className="label">Start with</div>
        <ul className="mt-3 flex flex-col gap-3">
          {STARTERS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="rail-accent text-left"
                style={{
                  borderLeftColor: "var(--color-border-hair)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                <span className="text-sm">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InlineCitations({
  text,
  knownIds,
}: {
  text: string;
  knownIds: Set<string>;
}) {
  const out: React.ReactNode[] = [];
  const pattern = /\[([a-z0-9_]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let chipIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    const [raw, id] = match;
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    if (knownIds.has(id)) {
      out.push(
        <Link
          key={`cite-${chipIdx++}`}
          href={`/baseline/${id}`}
          className="citation-chip"
          title={`Open ${id} in the baseline explorer`}
        >
          {id}
        </Link>,
      );
    } else {
      out.push(raw);
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }

  return <>{out}</>;
}
