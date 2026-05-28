"use client";

import type { BaselineAnchor } from "@/lib/brief/types";
import type { EntitySummary } from "@/lib/entity-summary";

type ResolvedField = {
  value: EntitySummary["dimensions"][number]["fields"][number]["value"];
  source_id: string | null;
  source_url: string | null;
  notes: string | null;
} | null;

type Props = {
  anchor: BaselineAnchor;
  resolved: ResolvedField;
  onOpen: (entityId: string) => void;
};

function shortLabel(anchor: BaselineAnchor): string {
  return `${anchor.entity_id} · ${anchor.field}`;
}

function claimLabel(claim: BaselineAnchor["claim_kind"]): string {
  switch (claim) {
    case "uc_has_position":
      return "Yes";
    case "uc_silent":
      return "Silent";
    case "uc_contradicts":
      return "Equivocal";
    case "baseline_missing":
      return "Not in baseline";
  }
}

function claimTone(claim: BaselineAnchor["claim_kind"]): string {
  switch (claim) {
    case "uc_has_position":
      return "var(--color-accent)";
    case "uc_silent":
      return "var(--color-warn)";
    case "uc_contradicts":
      return "var(--color-warn-strong)";
    case "baseline_missing":
      return "var(--color-text-subtle)";
  }
}

export function BaselineAnchorChip({ anchor, resolved, onOpen }: Props) {
  const ok = resolved !== null || anchor.claim_kind === "baseline_missing";
  const hover = resolved?.notes ?? (resolved ? String(resolved.value) : "Not in the current baseline");
  return (
    <button
      type="button"
      onClick={() => onOpen(anchor.entity_id)}
      className="citation-chip"
      title={`${shortLabel(anchor)} — ${claimLabel(anchor.claim_kind)}\n${hover}`}
      style={{
        background: ok ? undefined : "var(--color-bg-muted)",
        color: ok ? undefined : "var(--color-text-subtle)",
      }}
    >
      <span>{shortLabel(anchor)}</span>
      <span
        aria-hidden
        style={{
          marginLeft: "0.35rem",
          padding: "0 0.25rem",
          background: "var(--color-bg)",
          color: claimTone(anchor.claim_kind),
          fontWeight: 600,
          borderRadius: 2,
        }}
      >
        {claimLabel(anchor.claim_kind)}
      </span>
    </button>
  );
}
