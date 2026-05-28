"use client";

import type { PeerAnchor } from "@/lib/brief/types";

type Props = {
  anchor: PeerAnchor;
  onOpen: (peerId: string) => void;
};

function claimLabel(claim: PeerAnchor["claim_kind"]): string {
  switch (claim) {
    case "peer_has_position":
      return "Yes";
    case "peer_silent":
      return "Silent";
    case "peer_announced":
      return "Announced";
  }
}

export function PeerAnchorChip({ anchor, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpen(anchor.peer_id)}
      className="citation-chip"
      title={`Peer: ${anchor.peer_id} · ${anchor.field} — ${claimLabel(anchor.claim_kind)}`}
      style={{
        background: "var(--color-highlight-soft)",
        color: "var(--color-ink)",
      }}
    >
      <span>peer · {anchor.peer_id} · {anchor.field}</span>
      <span
        aria-hidden
        style={{
          marginLeft: "0.35rem",
          padding: "0 0.25rem",
          background: "var(--color-bg)",
          color: "var(--color-warn-strong)",
          fontWeight: 600,
          borderRadius: 2,
        }}
      >
        {claimLabel(anchor.claim_kind)}
      </span>
    </button>
  );
}
