/**
 * Brief item validator.
 *
 * Walks every anchor in a candidate BriefItem and confirms it resolves
 * against the current baseline / peer baseline / committee directory /
 * loaded raw-item set. Items with any failing required anchor are
 * rejected so they don't reach the published Brief.
 *
 * The rejection record is preserved as a JSON sidecar via
 * storage.writeRejected so the audit trail is in git.
 */

import {
  DIMENSION_IDS,
  type DimensionId,
  getEntity,
} from "../baseline.ts";
import { getPeer } from "../peers.ts";
import { memberIds } from "../committee.ts";
import { effectiveDateMs } from "./recency.ts";
import type {
  BaselineAnchor,
  BriefItem,
  BriefRawItem,
  FeedSource,
  PeerAnchor,
} from "./types.ts";

const KNOWN_DIMENSIONS = new Set<DimensionId>(DIMENSION_IDS);

export type ValidationFailure = {
  item: BriefItem;
  reasons: string[];
};

export type ValidationResult = {
  accepted: BriefItem[];
  rejected: ValidationFailure[];
};

/**
 * Recency window for the date gate. The committee window is wider (grace)
 * than the strict window applied to external/peer/vendor sources. When
 * omitted, the date gate is skipped (e.g. legacy callers).
 */
export type ValidateWindow = {
  strictStartMs: number;
  committeeStartMs: number;
  endMs: number;
  /** Human-readable "from..to" for the strict window, used in reasons. */
  strictLabel: string;
  /** Human-readable "from..to" for the committee grace window. */
  committeeLabel: string;
};

function validateBaselineAnchor(anchor: BaselineAnchor): string | null {
  if (!KNOWN_DIMENSIONS.has(anchor.dimension)) {
    return `baseline_anchor dimension="${anchor.dimension}" is not one of the 10 declared dimensions`;
  }
  if (anchor.claim_kind === "baseline_missing") {
    // Explicitly claiming the field is missing from the baseline. The
    // entity may or may not exist; either way the model has flagged
    // that the baseline does not yet cover this claim, which is
    // honest and shippable.
    return null;
  }
  const entity = getEntity(anchor.entity_id);
  if (!entity) {
    return `baseline_anchor entity_id="${anchor.entity_id}" is not in the UC baseline`;
  }
  const bucket = entity[anchor.dimension];
  if (!bucket) {
    return `baseline_anchor entity "${anchor.entity_id}" has no fields recorded for dimension "${anchor.dimension}" (claim_kind=${anchor.claim_kind})`;
  }
  const record = bucket[anchor.field];
  if (!record) {
    return `baseline_anchor field "${anchor.field}" not present on ${anchor.entity_id}.${anchor.dimension}`;
  }
  // claim_kind cross-check: the model said "uc_has_position" but the
  // baseline says value === false. Flag the inconsistency rather than
  // silently accepting the chip with a misleading label.
  if (anchor.claim_kind === "uc_has_position" && (record.value === false || record.value === null)) {
    return `baseline_anchor claim_kind=uc_has_position but baseline value is ${JSON.stringify(record.value)} for ${anchor.entity_id}.${anchor.dimension}.${anchor.field}`;
  }
  if (anchor.claim_kind === "uc_silent" && record.value !== false) {
    return `baseline_anchor claim_kind=uc_silent but baseline value is ${JSON.stringify(record.value)} for ${anchor.entity_id}.${anchor.dimension}.${anchor.field}`;
  }
  if (anchor.claim_kind === "uc_contradicts" && record.value !== "equivocal") {
    return `baseline_anchor claim_kind=uc_contradicts but baseline value is ${JSON.stringify(record.value)} for ${anchor.entity_id}.${anchor.dimension}.${anchor.field}`;
  }
  return null;
}

function validatePeerAnchor(anchor: PeerAnchor): string | null {
  if (!KNOWN_DIMENSIONS.has(anchor.dimension)) {
    return `peer_anchor dimension="${anchor.dimension}" is not one of the 10 declared dimensions`;
  }
  const peer = getPeer(anchor.peer_id);
  if (!peer) {
    return `peer_anchor peer_id="${anchor.peer_id}" is not in the peer baseline`;
  }
  const bucket = peer[anchor.dimension];
  if (!bucket) {
    return `peer_anchor peer "${anchor.peer_id}" has no fields recorded for dimension "${anchor.dimension}"`;
  }
  const record = bucket[anchor.field];
  if (!record) {
    return `peer_anchor field "${anchor.field}" not present on ${anchor.peer_id}.${anchor.dimension}`;
  }
  return null;
}

function validateFeedSource(
  fs: FeedSource,
  rawIds: Set<string>,
  memberIdSet: Set<string>,
): string | null {
  if (!fs.url || !/^https?:\/\//i.test(fs.url)) {
    return `feed_source url is not http(s): ${fs.url}`;
  }
  if (fs.kind === "committee_signal") {
    if (!rawIds.has(fs.activity_item_id)) {
      return `feed_source.activity_item_id "${fs.activity_item_id}" was not in the loaded raw-item set`;
    }
    if (!memberIdSet.has(fs.member_id) && fs.member_id !== "committee") {
      return `feed_source.member_id "${fs.member_id}" is not a known committee member`;
    }
  }
  return null;
}

/**
 * Date gate. Returns a rejection reason if the feed_source's effective date
 * (published_at, else the raw item's discovered_at) falls outside the
 * applicable window — the grace window for committee_signal, the strict
 * window otherwise. Returns null when the source is fresh.
 */
function validateFeedSourceDate(
  fs: FeedSource,
  byId: Map<string, BriefRawItem>,
  byUrl: Map<string, BriefRawItem>,
  window: ValidateWindow,
): string | null {
  const raw =
    fs.kind === "committee_signal"
      ? byId.get(fs.activity_item_id)
      : byUrl.get(fs.url);
  const t = effectiveDateMs({
    published_at: fs.published_at,
    discovered_at: raw?.discovered_at ?? null,
  });
  const isCommittee = fs.kind === "committee_signal";
  const startMs = isCommittee ? window.committeeStartMs : window.strictStartMs;
  const label = isCommittee ? window.committeeLabel : window.strictLabel;
  if (t === null || t < startMs || t > window.endMs) {
    return `feed_source "${fs.title}" published_at=${fs.published_at ?? "null"} is outside the brief window [${label}]`;
  }
  return null;
}

export function validateItems(
  items: BriefItem[],
  rawItems: BriefRawItem[],
  window?: ValidateWindow,
): ValidationResult {
  const rawIds = new Set(rawItems.map((r) => r.id));
  const byId = new Map(rawItems.map((r) => [r.id, r]));
  const byUrl = new Map(rawItems.map((r) => [r.url, r]));
  const memberIdSet = new Set(memberIds());
  const accepted: BriefItem[] = [];
  const rejected: ValidationFailure[] = [];

  for (const item of items) {
    const reasons: string[] = [];

    if (!item.headline?.trim()) reasons.push("headline is empty");
    if (!item.what_happened?.trim()) reasons.push("what_happened is empty");
    if (!item.why_it_matters?.trim()) reasons.push("why_it_matters is empty");
    if (!item.for_the_committee?.trim()) reasons.push("for_the_committee is empty");

    if (!Array.isArray(item.baseline_anchors) || item.baseline_anchors.length === 0) {
      reasons.push(
        "baseline_anchors is empty — every why_it_matters claim must cite at least one baseline field",
      );
    } else {
      for (const anchor of item.baseline_anchors) {
        const err = validateBaselineAnchor(anchor);
        if (err) reasons.push(err);
      }
    }

    for (const anchor of item.peer_anchors ?? []) {
      const err = validatePeerAnchor(anchor);
      if (err) reasons.push(err);
    }

    if (!Array.isArray(item.feed_sources) || item.feed_sources.length === 0) {
      reasons.push("feed_sources is empty — what_happened must trace to at least one source");
    } else {
      for (const fs of item.feed_sources) {
        const err = validateFeedSource(fs, rawIds, memberIdSet);
        if (err) reasons.push(err);
        if (window) {
          const dateErr = validateFeedSourceDate(fs, byId, byUrl, window);
          if (dateErr) reasons.push(dateErr);
        }
      }
    }

    for (const expert of item.experts ?? []) {
      if (!memberIdSet.has(expert.member_id)) {
        reasons.push(`expert member_id "${expert.member_id}" is not a known committee member`);
      }
    }

    if (reasons.length === 0) {
      accepted.push(item);
    } else {
      rejected.push({ item, reasons });
    }
  }

  return { accepted, rejected };
}
