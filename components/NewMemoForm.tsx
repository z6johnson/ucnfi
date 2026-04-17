"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { Pillar } from "@/content/northstar";

type Status = "idle" | "submitting" | "error";

export function NewMemoForm({ pillars }: { pillars: Pillar[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [pillar, setPillar] = useState("");
  const [oa, setOa] = useState("");
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const derivedSlug = useMemo(() => {
    return title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }, [title]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          pillar: pillar || undefined,
          oa: oa.trim() || undefined,
          author: author.trim() || undefined,
          body: body.trim(),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as { slug: string };
      router.push(`/memos/${data.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  const disabled = status === "submitting";

  return (
    <form onSubmit={onSubmit} className="mt-8 flex max-w-2xl flex-col gap-6">
      <Field label="Title" hint={derivedSlug ? `slug: ${derivedSlug}` : null}>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={disabled}
          className="ucnfi-input"
          placeholder="Campus AI council coverage across the UC system"
        />
      </Field>

      <Field label="Summary">
        <textarea
          required
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={disabled}
          rows={2}
          className="ucnfi-input"
          placeholder="A one-line description that shows up on the memos list."
        />
      </Field>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="Pillar (optional)">
          <select
            value={pillar}
            onChange={(e) => setPillar(e.target.value)}
            disabled={disabled}
            className="ucnfi-input"
          >
            <option value="">— none —</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number}. {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Opportunity Area (optional)">
          <input
            type="text"
            value={oa}
            onChange={(e) => setOa(e.target.value)}
            disabled={disabled}
            className="ucnfi-input"
            placeholder="oa-1"
          />
        </Field>
      </div>

      <Field label="Author (optional)">
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          disabled={disabled}
          className="ucnfi-input"
          placeholder="UCNFI Research copilot"
        />
      </Field>

      <Field label="Body (Markdown)">
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled}
          rows={16}
          className="ucnfi-input font-mono text-sm"
          placeholder={"## Framing\n\n...\n\n## What the baseline says\n\n- ..."}
        />
      </Field>

      {error ? (
        <div
          className="rail-accent"
          style={{ borderLeftColor: "var(--color-danger)" }}
        >
          <span className="label" style={{ color: "var(--color-danger)" }}>
            Could not save memo
          </span>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            {error}
          </p>
        </div>
      ) : null}

      <div className="hairline flex items-center justify-end gap-6 pt-4">
        <button
          type="button"
          onClick={() => router.push("/memos")}
          disabled={disabled}
          className="label"
          style={{
            color: "var(--color-text-subtle)",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled || !title.trim() || !summary.trim() || !body.trim()}
          className="label"
          style={{
            color:
              disabled || !title.trim() || !summary.trim() || !body.trim()
                ? "var(--color-text-subtle)"
                : "var(--color-accent)",
            cursor:
              disabled || !title.trim() || !summary.trim() || !body.trim()
                ? "not-allowed"
                : "pointer",
          }}
        >
          {disabled ? "Saving…" : "Publish memo ↵"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        {hint ? (
          <span
            className="label"
            style={{ color: "var(--color-text-subtle)" }}
          >
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
