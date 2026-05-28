"use client";

import { useState } from "react";
import { EntityDrawer } from "@/components/EntityDrawer";
import { MemberDrawer } from "@/components/MemberDrawer";
import type { BriefItem, FeedSource } from "@/lib/brief/types";
import { BaselineAnchorChip } from "./BaselineAnchorChip";
import { BriefInlineChat, type BriefChatScope } from "./BriefInlineChat";
import { PeerAnchorChip } from "./PeerAnchorChip";
import { PeerDrawer } from "./PeerDrawer";

export type BriefItemCardData = {
  item: BriefItem;
  /**
   * Snapshot of the current baseline FieldRecord for each anchor, looked
   * up on the server so the chip can show the live value at render
   * time. Keyed by `${entity_id}|${dimension}|${field}`.
   */
  resolvedBaseline: Record<
    string,
    {
      value: boolean | string | number | null;
      source_id: string | null;
      source_url: string | null;
      notes: string | null;
    } | null
  >;
  /** Display name lookup for committee members listed in experts. */
  memberNames: Record<string, string>;
};

type Props = {
  data: BriefItemCardData;
  editionId: string;
};

function priorityLabel(p: BriefItem["priority"]): string {
  switch (p) {
    case 1:
      return "External development";
    case 2:
      return "Peer move";
    case 3:
      return "Vendor shift";
    case 4:
      return "Committee signal";
  }
}

function formatFeedSource(fs: FeedSource): string {
  switch (fs.kind) {
    case "external":
      return `${fs.subkind.replace(/_/g, " ")}`;
    case "peer":
      return `peer · ${fs.peer_id}`;
    case "vendor":
      return `${fs.subkind.replace(/^vendor_/, "vendor · ").replace(/_/g, " ")}`;
    case "committee_signal":
      return `committee · ${fs.member_id}`;
  }
}

function buildChatScope(item: BriefItem, editionId: string): BriefChatScope {
  const anchor_lines: string[] = [];
  for (const a of item.baseline_anchors) {
    anchor_lines.push(
      `[${a.entity_id}] ${a.dimension}/${a.field} — ${a.claim_kind.replace(/_/g, " ")}`,
    );
  }
  for (const a of item.peer_anchors) {
    anchor_lines.push(
      `peer · ${a.peer_id} ${a.dimension}/${a.field} — ${a.claim_kind.replace(/_/g, " ")}`,
    );
  }
  return {
    edition_id: editionId,
    item_id: item.item_id,
    headline: item.headline,
    anchor_lines,
  };
}

export function BriefItemCard({ data, editionId }: Props) {
  const { item, resolvedBaseline, memberNames } = data;
  const [openEntity, setOpenEntity] = useState<string | null>(null);
  const [openPeer, setOpenPeer] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<string | null>(null);

  return (
    <article className="hairline pt-8 mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="label">{priorityLabel(item.priority)}</span>
        <span
          className="label"
          style={{ color: "var(--color-text-subtle)" }}
        >
          {item.item_id}
        </span>
      </div>

      <h2
        className="display mt-2"
        style={{ fontSize: "var(--text-xl)" }}
      >
        {item.headline}
      </h2>

      {/* What happened */}
      <section className="mt-6">
        <span className="label">What happened</span>
        <p
          className="prose-body mt-2"
          style={{ color: "var(--color-text)" }}
        >
          {item.what_happened}
        </p>
        {item.feed_sources.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {item.feed_sources.map((fs, idx) => (
              <li key={idx} className="text-xs">
                <a
                  href={fs.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={fs.title}
                >
                  {formatFeedSource(fs)} ↗
                </a>
                {fs.published_at ? (
                  <span
                    className="ml-2"
                    style={{ color: "var(--color-text-subtle)" }}
                  >
                    {fs.published_at.slice(0, 10)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Why it matters to UC */}
      <section className="mt-6">
        <span className="label">Why it matters to UC</span>
        <p
          className="prose-body mt-2"
          style={{ color: "var(--color-text)" }}
        >
          {item.why_it_matters}
        </p>
        {item.baseline_anchors.length + item.peer_anchors.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.baseline_anchors.map((anchor, idx) => {
              const key = `${anchor.entity_id}|${anchor.dimension}|${anchor.field}`;
              return (
                <BaselineAnchorChip
                  key={`b-${idx}`}
                  anchor={anchor}
                  resolved={resolvedBaseline[key] ?? null}
                  onOpen={setOpenEntity}
                />
              );
            })}
            {item.peer_anchors.map((anchor, idx) => (
              <PeerAnchorChip
                key={`p-${idx}`}
                anchor={anchor}
                onOpen={setOpenPeer}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* For the committee */}
      <section className="mt-6">
        <span className="label">For the committee</span>
        <p
          className="prose-body mt-2"
          style={{ color: "var(--color-ink)", fontWeight: 500 }}
        >
          {item.for_the_committee}
        </p>
      </section>

      {/* Relevant experts on the committee */}
      {item.experts.length > 0 ? (
        <section className="mt-6">
          <span className="label">Experts to weigh in</span>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {item.experts.map((expert) => (
              <li key={expert.member_id}>
                <button
                  type="button"
                  onClick={() => setOpenMember(expert.member_id)}
                  className="citation-chip"
                  title={expert.why}
                >
                  {memberNames[expert.member_id] ?? expert.member_id}
                </button>
                <span
                  className="ml-2 text-xs"
                  style={{ color: "var(--color-text-subtle)" }}
                >
                  {expert.why}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <BriefInlineChat scope={buildChatScope(item, editionId)} />

      <EntityDrawer
        entityId={openEntity}
        onClose={() => setOpenEntity(null)}
      />
      <PeerDrawer peerId={openPeer} onClose={() => setOpenPeer(null)} />
      <MemberDrawer memberId={openMember} onClose={() => setOpenMember(null)} />
    </article>
  );
}
