"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EntitySummary } from "@/lib/entity-summary";

type State =
  | { status: "idle" }
  | { status: "loading"; entityId: string }
  | { status: "ready"; entityId: string; data: EntitySummary }
  | { status: "error"; entityId: string; message: string };

type Props = {
  entityId: string | null;
  onClose: () => void;
};

function renderValue(value: EntitySummary["dimensions"][number]["fields"][number]["value"]) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined) return "—";
  return String(value);
}

function valueTone(value: EntitySummary["dimensions"][number]["fields"][number]["value"]) {
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

export function EntityDrawer({ entityId, onClose }: Props) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [cache, setCache] = useState<Record<string, EntitySummary>>({});

  // Fetch on open.
  useEffect(() => {
    if (!entityId) return;
    if (cache[entityId]) {
      setState({ status: "ready", entityId, data: cache[entityId] });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", entityId });
    fetch(`/api/entity/${encodeURIComponent(entityId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return (await res.json()) as EntitySummary;
      })
      .then((data) => {
        if (cancelled) return;
        setCache((c) => ({ ...c, [entityId]: data }));
        setState({ status: "ready", entityId, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          entityId,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, cache]);

  // Close on Escape.
  useEffect(() => {
    if (!entityId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entityId, onClose]);

  if (!entityId) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      aria-modal="true"
      role="dialog"
      aria-label="Entity detail"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close entity detail"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(0, 32, 51, 0.28)", cursor: "pointer" }}
      />

      {/* Panel */}
      <aside
        className="relative flex h-full w-full max-w-[520px] flex-col overflow-y-auto px-8 py-8 shadow-xl md:px-10"
        style={{
          background: "var(--color-bg)",
          borderLeft: "1px solid var(--color-border-hair)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="label">
            {state.status === "ready"
              ? state.data.entity_type_label
              : "Baseline entity"}
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
          <p
            className="label mt-6"
            style={{ color: "var(--color-text-subtle)" }}
          >
            Loading {state.entityId}…
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
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              {state.message}
            </p>
          </div>
        ) : null}

        {state.status === "ready" ? (
          <>
            <h2 className="display mt-3">{state.data.entity_name}</h2>
            <div
              className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
              style={{ color: "var(--color-text-subtle)" }}
            >
              <span>{state.data.dimension_count} dimensions</span>
              <span aria-hidden>·</span>
              <span>{state.data.field_count} data points</span>
              {state.data.document_count !== null ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{state.data.document_count} sources</span>
                </>
              ) : null}
            </div>

            <div className="mt-4">
              <Link
                href={`/baseline/${state.data.entity_id}`}
                className="label"
                target="_blank"
                rel="noreferrer"
              >
                Open full entity page ↗
              </Link>
            </div>

            {state.data.dimensions.map((dim) => (
              <section key={dim.id} className="mt-8">
                <header className="hairline flex items-baseline justify-between pb-2">
                  <h3
                    className="display"
                    style={{ fontSize: "var(--text-lg)" }}
                  >
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
