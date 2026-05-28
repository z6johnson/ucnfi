"use client";

import { useEffect, useState } from "react";
import type { PeerSummary } from "@/lib/peer-summary";

type State =
  | { status: "idle" }
  | { status: "loading"; peerId: string }
  | { status: "ready"; peerId: string; data: PeerSummary }
  | { status: "error"; peerId: string; message: string };

type Props = {
  peerId: string | null;
  onClose: () => void;
};

function renderValue(value: PeerSummary["dimensions"][number]["fields"][number]["value"]) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined) return "—";
  return String(value);
}

function valueTone(value: PeerSummary["dimensions"][number]["fields"][number]["value"]) {
  if (value === true) return "var(--color-accent)";
  if (value === false) return "var(--color-text-subtle)";
  return "var(--color-ink)";
}

function humanizeField(name: string) {
  return name
    .replace(/^has_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PeerDrawer({ peerId, onClose }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [cache, setCache] = useState<Record<string, PeerSummary>>({});

  useEffect(() => {
    if (!peerId) return;
    if (cache[peerId]) {
      setState({ status: "ready", peerId, data: cache[peerId] });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", peerId });
    fetch(`/api/peer/${encodeURIComponent(peerId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return (await res.json()) as PeerSummary;
      })
      .then((data) => {
        if (cancelled) return;
        setCache((c) => ({ ...c, [peerId]: data }));
        setState({ status: "ready", peerId, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          peerId,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [peerId, cache]);

  useEffect(() => {
    if (!peerId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peerId, onClose]);

  if (!peerId) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      aria-modal="true"
      role="dialog"
      aria-label="Peer institution detail"
    >
      <button
        type="button"
        aria-label="Close peer detail"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(0, 32, 51, 0.28)", cursor: "pointer" }}
      />

      <aside
        className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto px-8 py-8 shadow-xl md:px-10"
        style={{
          background: "var(--color-bg)",
          borderLeft: "1px solid var(--color-border-hair)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="label">
            {state.status === "ready" ? state.data.peer_kind_label : "Peer institution"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="label"
            style={{ color: "var(--color-text-subtle)", cursor: "pointer" }}
          >
            Close ✕
          </button>
        </div>

        {state.status === "loading" ? (
          <p className="label mt-6" style={{ color: "var(--color-text-subtle)" }}>
            Loading {state.peerId}…
          </p>
        ) : null}

        {state.status === "error" ? (
          <div
            className="rail-accent mt-6"
            style={{ borderLeftColor: "var(--color-danger)" }}
          >
            <span className="label" style={{ color: "var(--color-danger)" }}>
              Error
            </span>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {state.message}
            </p>
          </div>
        ) : null}

        {state.status === "ready" ? (
          <>
            <h2 className="display mt-3">{state.data.peer_name}</h2>
            <div
              className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
              style={{ color: "var(--color-text-subtle)" }}
            >
              <span>{state.data.dimension_count} dimensions</span>
              <span aria-hidden>·</span>
              <span>{state.data.field_count} data points</span>
              {state.data.uc_counterpart_id ? (
                <>
                  <span aria-hidden>·</span>
                  <span>UC counterpart: {state.data.uc_counterpart_id}</span>
                </>
              ) : null}
            </div>

            {state.data.dimensions.length === 0 ? (
              <p
                className="mt-6 text-sm"
                style={{ color: "var(--color-text-subtle)" }}
              >
                No fields recorded for this peer yet. The peer baseline is
                hand-curated; this entry is a placeholder until enrichment.
              </p>
            ) : null}

            {state.data.dimensions.map((dim) => (
              <section key={dim.id} className="mt-8">
                <header className="hairline flex items-baseline justify-between pb-2">
                  <h3 className="display" style={{ fontSize: "var(--text-lg)" }}>
                    {dim.label}
                  </h3>
                  <span className="label">{dim.fields.length} fields</span>
                </header>
                <ul className="mt-3 flex flex-col gap-5">
                  {dim.fields.map((f) => (
                    <li key={f.name} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: "var(--color-text)" }}
                        >
                          {humanizeField(f.name)}
                        </span>
                        <span
                          className="text-sm font-semibold"
                          style={{ color: valueTone(f.value) }}
                        >
                          {renderValue(f.value)}
                        </span>
                      </div>
                      {f.notes ? (
                        <p
                          className="text-sm"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {f.notes}
                        </p>
                      ) : null}
                      {f.source_id || f.source_url ? (
                        <div className="flex items-center gap-3 pt-1">
                          {f.source_id ? (
                            <span className="label">{f.source_id}</span>
                          ) : null}
                          {f.source_url ? (
                            <a
                              href={f.source_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-xs"
                            >
                              Source ↗
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        ) : null}
      </aside>
    </div>
  );
}
