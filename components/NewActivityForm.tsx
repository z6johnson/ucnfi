"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "published" | "error";
type Mode = "link" | "text" | "file";
type Scope = "topic" | "committee" | "member";

export type MemberOption = { id: string; name: string };

type PublishResult = {
  id: string;
  url: string;
  commitSha?: string;
  commitUrl?: string;
};

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 24; // ~2 minutes

const MODE_TABS: Array<{ id: Mode; label: string }> = [
  { id: "link", label: "Link" },
  { id: "text", label: "Paste text" },
  { id: "file", label: "Upload file" },
];

const SCOPE_TABS: Array<{ id: Scope; label: string }> = [
  { id: "topic", label: "News" },
  { id: "committee", label: "Committee" },
  { id: "member", label: "Member" },
];

const FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,.xls,.xlsx";

export function NewActivityForm({ members }: { members: MemberOption[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("link");
  const [scope, setScope] = useState<Scope>("topic");
  const [memberId, setMemberId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishResult | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);

    try {
      const body = new FormData();
      body.set("mode", mode);
      body.set("scope", scope);
      if (scope === "member") body.set("memberId", memberId);
      body.set("title", title.trim());
      if (summary.trim()) body.set("summary", summary.trim());
      if (publishedAt) body.set("publishedAt", publishedAt);
      if (mode === "link") body.set("url", url.trim());
      if (mode === "text") body.set("text", text);
      if (mode === "file" && file) body.set("file", file);

      const res = await fetch("/api/activity", { method: "POST", body });
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
          router.push("/activity?source=manual");
          router.refresh();
        }}
      />
    );
  }

  const disabled = status === "submitting";
  const modeReady =
    mode === "link"
      ? url.trim().length > 0
      : mode === "text"
        ? text.trim().length > 0
        : file != null;
  const scopeReady = scope !== "member" || memberId.length > 0;
  const canSubmit = !disabled && title.trim().length > 0 && modeReady && scopeReady;

  return (
    <form onSubmit={onSubmit} className="mt-8 flex max-w-2xl flex-col gap-6">
      <Field label="Type">
        <TabRow
          tabs={MODE_TABS}
          current={mode}
          disabled={disabled}
          onPick={(id) => setMode(id as Mode)}
        />
      </Field>

      {mode === "link" ? (
        <Field label="URL">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            className="ucnfi-input"
            placeholder="https://example.com/article"
          />
        </Field>
      ) : null}

      {mode === "text" ? (
        <Field label="Text" hint="Archived as a page in the feed">
          <textarea
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            rows={12}
            className="ucnfi-input font-mono text-sm"
            placeholder="Paste the article, note, or excerpt to archive…"
          />
        </Field>
      ) : null}

      {mode === "file" ? (
        <Field label="File" hint="PDF, Word, PowerPoint, Excel, CSV, txt/md · ≤ 15 MB">
          <input
            type="file"
            accept={FILE_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={disabled}
            className="text-sm"
          />
        </Field>
      ) : null}

      <Field label="Title">
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={disabled}
          className="ucnfi-input"
          placeholder="Headline shown in the feed"
        />
      </Field>

      <Field label="Summary / note (optional)">
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={disabled}
          rows={2}
          className="ucnfi-input"
          placeholder="A one-line description shown under the title."
        />
      </Field>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="Scope">
          <TabRow
            tabs={SCOPE_TABS}
            current={scope}
            disabled={disabled}
            onPick={(id) => setScope(id as Scope)}
          />
        </Field>

        <Field label="Published date (optional)">
          <input
            type="date"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            disabled={disabled}
            className="ucnfi-input"
          />
        </Field>
      </div>

      {scope === "member" ? (
        <Field label="Member">
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            disabled={disabled}
            required
            className="ucnfi-input"
          >
            <option value="">— select a member —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {error ? (
        <div
          className="rail-accent"
          style={{ borderLeftColor: "var(--color-danger)" }}
        >
          <span className="label" style={{ color: "var(--color-danger)" }}>
            Could not add source
          </span>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="hairline flex items-center justify-end gap-6 pt-4">
        <button
          type="button"
          onClick={() => router.push("/activity")}
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
          disabled={!canSubmit}
          className="label"
          style={{
            color: canSubmit ? "var(--color-accent)" : "var(--color-text-subtle)",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {disabled ? "Adding…" : "Add to feed ↵"}
        </button>
      </div>
    </form>
  );
}

type PollStatus = "building" | "ready" | "timeout" | "error";

function PublishedPanel({
  result,
  onDone,
}: {
  result: PublishResult;
  onDone: () => void;
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
        // The asset (or, for links, the feed itself) becomes available once
        // Vercel finishes the rebuild triggered by the commit.
        const probe = result.url.startsWith("/activity-uploads/")
          ? result.url
          : "/activity?source=manual";
        const res = await fetch(probe, { method: "HEAD", cache: "no-store" });
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
  }, [result.url]);

  useEffect(() => {
    if (pollStatus === "ready") {
      const id = window.setTimeout(onDone, 600);
      return () => window.clearTimeout(id);
    }
  }, [pollStatus, onDone]);

  return (
    <div className="mt-8 flex max-w-2xl flex-col gap-6">
      <div className="rail-accent" style={{ borderLeftColor: "var(--color-accent)" }}>
        <span className="label">Committed to GitHub</span>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {pollStatus === "ready"
            ? "Live. Redirecting to the feed…"
            : pollStatus === "timeout"
              ? "Still building — check the feed shortly."
              : pollStatus === "error"
                ? "Could not check build status. Try the feed manually."
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
          href="/activity?source=manual"
          className="label"
          style={{ color: "var(--color-accent)" }}
        >
          Open the Activity feed →
        </Link>
        <Link
          href="/activity/new"
          className="label"
          style={{ color: "var(--color-text-subtle)" }}
        >
          Add another
        </Link>
      </div>
    </div>
  );
}

function TabRow({
  tabs,
  current,
  disabled,
  onPick,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  current: string;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = t.id === current;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            disabled={disabled}
            className="no-underline rounded px-2.5 py-1 text-xs"
            style={{
              backgroundColor: active ? "var(--color-accent-wash)" : "transparent",
              border: "1px solid var(--color-border-hair)",
              color: active ? "var(--color-ink)" : "var(--color-text-subtle)",
              fontWeight: active ? 600 : 400,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
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
          <span className="label" style={{ color: "var(--color-text-subtle)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
