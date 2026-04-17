"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Pillar } from "@/content/northstar";

type Status = "idle" | "submitting" | "published" | "error";

type PublishResult = {
  slug: string;
  commitSha?: string;
  commitUrl?: string;
};

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 24; // ~2 minutes

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
  const [published, setPublished] = useState<PublishResult | null>(null);

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

      const data = (await res.json()) as PublishResult;
      setPublished(data);
      setStatus("published");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  if (status === "published" && published) {
    return (
      <PublishedPanel
        result={published}
        onDone={() => {
          router.push(`/memos/${published.slug}`);
          router.refresh();
        }}
        body={body}
      />
    );
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
          {disabled ? "Publishing…" : "Publish memo ↵"}
        </button>
      </div>
    </form>
  );
}

type PollStatus = "building" | "ready" | "timeout" | "error";

function PublishedPanel({
  result,
  onDone,
  body,
}: {
  result: PublishResult;
  onDone: () => void;
  body: string;
}) {
  const [pollStatus, setPollStatus] = useState<PollStatus>("building");
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let currentAttempt = 0;

    const tick = async () => {
      if (cancelled.current) return;
      currentAttempt += 1;
      setAttempt(currentAttempt);

      try {
        const res = await fetch(`/memos/${result.slug}`, {
          method: "HEAD",
          cache: "no-store",
        });
        if (cancelled.current) return;
        if (res.ok) {
          setPollStatus("ready");
          return;
        }
      } catch {
        if (cancelled.current) return;
        setPollStatus("error");
        return;
      }

      if (currentAttempt >= POLL_MAX_ATTEMPTS) {
        setPollStatus("timeout");
        return;
      }
      window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    const id = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled.current = true;
      window.clearTimeout(id);
    };
  }, [result.slug]);

  useEffect(() => {
    if (pollStatus === "ready") {
      const id = window.setTimeout(onDone, 600);
      return () => window.clearTimeout(id);
    }
  }, [pollStatus, onDone]);

  return (
    <div className="mt-8 flex max-w-2xl flex-col gap-6">
      <div
        className="rail-accent"
        style={{ borderLeftColor: "var(--color-accent)" }}
      >
        <span className="label">Committed to GitHub</span>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          {pollStatus === "ready"
            ? "Published. Redirecting…"
            : pollStatus === "timeout"
              ? "Still building — try the link shortly."
              : pollStatus === "error"
                ? "Could not check build status. Try the link manually."
                : `Vercel is rebuilding the site (~60s). Checking every ${POLL_INTERVAL_MS / 1000}s — attempt ${attempt}/${POLL_MAX_ATTEMPTS}.`}
        </p>
        {result.commitUrl ? (
          <p className="mt-2 text-sm">
            <a
              href={result.commitUrl}
              target="_blank"
              rel="noreferrer"
              className="label"
              style={{ color: "var(--color-accent)" }}
            >
              View commit on GitHub →
            </a>
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-6">
        <Link
          href={`/memos/${result.slug}`}
          className="label"
          style={{ color: "var(--color-accent)" }}
        >
          Open /memos/{result.slug} →
        </Link>
        <Link
          href="/memos"
          className="label"
          style={{ color: "var(--color-text-subtle)" }}
        >
          Back to memos
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label">Submitted body (read-only)</span>
        <textarea
          readOnly
          value={body}
          rows={10}
          className="ucnfi-input font-mono text-sm"
        />
      </div>
    </div>
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
