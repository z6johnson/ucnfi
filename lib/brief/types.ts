/**
 * Types for the weekly Brief tab.
 *
 * Used by the generation pipeline (scripts/brief-weekly.ts +
 * lib/brief/generate.ts), the storage layer (lib/brief/storage.ts), and
 * the UI (app/brief/* + components/brief/*).
 *
 * No "server-only" import: the generation pipeline runs under
 * --experimental-strip-types in Node CLI, not just Next.js.
 */

import type { DimensionId } from "../baseline.ts";

/* ------------------------------------------------------------------ */
/* Anchors — the load-bearing contract                                 */
/* ------------------------------------------------------------------ */

/**
 * A pointer to a specific UC baseline field. Every "why it matters to
 * UC" claim must carry at least one of these. The renderer dereferences
 * each one through getEntity(entity_id)?.[dimension]?.[field] at view
 * time so the brief stays fresh as the baseline is enriched.
 */
export type BaselineAnchorClaim =
  | "uc_has_position"      // FieldRecord.value is truthy with citation
  | "uc_silent"             // FieldRecord.value === false + source_id === "inventory-gap"
  | "uc_contradicts"        // FieldRecord.value === "equivocal"
  | "baseline_missing";     // No bucket/field for this combination

export type BaselineAnchor = {
  entity_id: string;
  dimension: DimensionId;
  field: string;
  claim_kind: BaselineAnchorClaim;
};

export type PeerAnchorClaim =
  | "peer_has_position"
  | "peer_silent"
  | "peer_announced";

export type PeerAnchor = {
  peer_id: string;
  dimension: DimensionId;
  field: string;
  claim_kind: PeerAnchorClaim;
};

/* ------------------------------------------------------------------ */
/* Feed sources                                                        */
/* ------------------------------------------------------------------ */

export type FeedSourceKind = "external" | "peer" | "vendor" | "committee_signal";

export type ExternalSubkind =
  | "federal_register"
  | "ed_ocr"
  | "ca_legislature"
  | "court"
  | "peer_system_move"
  | "web_search"
  | "other";

export type VendorSubkind =
  | "vendor_anthropic"
  | "vendor_openai"
  | "vendor_google"
  | "vendor_microsoft"
  | "edu_press"
  | "incident"
  | "other";

export type FeedSource =
  | {
      kind: "external";
      subkind: ExternalSubkind;
      url: string;
      title: string;
      published_at: string | null;
    }
  | {
      kind: "peer";
      peer_id: string;
      url: string;
      title: string;
      published_at: string | null;
    }
  | {
      kind: "vendor";
      subkind: VendorSubkind;
      url: string;
      title: string;
      published_at: string | null;
    }
  | {
      kind: "committee_signal";
      activity_item_id: string;
      member_id: string;
      url: string;
      title: string;
      published_at: string | null;
    };

/* ------------------------------------------------------------------ */
/* Experts                                                             */
/* ------------------------------------------------------------------ */

export type MemberRef = {
  member_id: string;
  why: string;
};

/* ------------------------------------------------------------------ */
/* Brief item — the four-part renderer's input                         */
/* ------------------------------------------------------------------ */

/** Priority maps to the four feed buckets in the spec. */
export type BriefPriority = 1 | 2 | 3 | 4;

/** Prose for the four required sections of an item. */
export type BriefItemProse = {
  headline: string;
  what_happened: string;
  why_it_matters: string;
  for_the_committee: string;
};

/** Structured metadata for an item; lives in the edition frontmatter. */
export type BriefItemMeta = {
  priority: BriefPriority;
  feed_sources: FeedSource[];
  baseline_anchors: BaselineAnchor[];
  peer_anchors: PeerAnchor[];
  experts: MemberRef[];
};

export type BriefItem = BriefItemProse &
  BriefItemMeta & {
    item_id: string;
  };

/* ------------------------------------------------------------------ */
/* Edition — one per week                                              */
/* ------------------------------------------------------------------ */

export type EditionStatus = "draft" | "published";

export type InputsManifest = {
  external: { from: string; to: string; n: number };
  peer: { from: string; to: string; n: number };
  vendor: { from: string; to: string; n: number };
  web: { from: string; to: string; n: number };
  committee_signal_dates: string[];
};

export type BriefEditionMeta = {
  edition_id: string;     // e.g. "2026-W22"
  week_ending: string;    // ISO date, UTC
  status: EditionStatus;
  reviewed_by: string;    // initials, empty in draft
  reviewed_at: string;    // ISO timestamp, empty in draft
  generated_at: string;   // ISO timestamp
  generated_by_model: string;
  inputs_manifest: InputsManifest;
};

export type BriefEdition = BriefEditionMeta & {
  items: BriefItem[];
};

/* ------------------------------------------------------------------ */
/* Raw collector output — fed into the generator                       */
/* ------------------------------------------------------------------ */

/**
 * Normalized output of all four collectors. The generator hands these
 * to Claude verbatim, with stable ids so the model can quote them in
 * feed_sources.
 */
export type BriefRawItem = {
  id: string;                  // SHA256 hash of canonical URL (32 chars)
  feed_kind: FeedSourceKind;
  subkind: string;             // federal_register, vendor_anthropic, etc.
  title: string;
  url: string;
  published_at: string | null;
  snippet: string;
  match_reason: string;
  discovered_at: string;
  /** Only set for committee_signal items — preserves the activity-item member. */
  member_id?: string;
  /** Only set for peer items — preserves which peer the move came from. */
  peer_id?: string;
};

/* ------------------------------------------------------------------ */
/* Sources config — curated RSS endpoints                              */
/* ------------------------------------------------------------------ */

export type ExternalSourceEntry = {
  url: string;
  subkind: ExternalSubkind;
  /**
   * If true, skip the AI-keyword pre-filter. Use for incident-reporting
   * feeds where AI is implied by the source itself.
   */
  skip_ai_filter?: boolean;
};

export type VendorSourceEntry = {
  url: string;
  subkind: VendorSubkind;
  skip_ai_filter?: boolean;
};

export type PeerSourceEntry = {
  peer_id: string;
  url: string;
};

export type SourcesConfig = {
  external: ExternalSourceEntry[];
  vendor: VendorSourceEntry[];
  peers: PeerSourceEntry[];
};
