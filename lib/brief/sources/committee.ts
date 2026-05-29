/**
 * Feed #4 — committee signal.
 *
 * Pure pass-through of the existing daily activity scan. Reads the last
 * N days of JSONL items from data/ucnfi-committee/activity/items/ and
 * filters to source kinds that matter for chair situational awareness:
 * an op-ed, position statement, press quote, or talk by a member is
 * something the chairs should know about before someone else tells
 * them.
 *
 * Items with source_kind="rss" or "arxiv" are excluded here even
 * though they were collected by the activity scan — those flow into
 * the weekly digest (lib/scan/digest.ts) instead. The brief wants
 * decision-shaped signal, not raw output.
 */

import {
  lastNDates,
  readItemsForDates,
  scopeOf,
  type ActivityItem,
} from "../../activity.ts";
import { canonicalUrl } from "../../activity.ts";
import { isFresh, windowBounds } from "../recency.ts";
import type { BriefRawItem } from "../types.ts";

/**
 * Activity source_kinds the brief considers "signal" (vs. raw output).
 * Tier-2 websearch items inherit the broader source-kind detail in
 * their match_reason, so all websearch items are eligible.
 */
function isSignalItem(item: ActivityItem): boolean {
  if (item.source_kind === "websearch") return true;
  // Tier-1 rss + arxiv items are typically raw output (papers, blog
  // posts). They belong in the weekly digest, not the President's brief.
  return false;
}

export type CollectCommitteeOpts = {
  repoRoot: string;
  endDate: Date;
  /** How many days of daily JSONL files to read, by discovery date. */
  windowDays: number;
  /**
   * Publication-recency grace window (days, inclusive of endDate). A member
   * position often surfaces in a scan well after it was published, so this
   * is wider than the strict RSS lookback. An item is admitted only if its
   * published_at (or discovered_at fallback) lands inside this window.
   * Default 30.
   */
  graceDays?: number;
};

export type CommitteeSignalBundle = {
  items: BriefRawItem[];
  /** ISO dates from which we pulled JSONL files (manifest input). */
  windowDates: string[];
};

export function collectCommitteeSignal(
  opts: CollectCommitteeOpts,
): CommitteeSignalBundle {
  const dates = lastNDates(opts.windowDays, opts.endDate);
  const items = readItemsForDates(opts.repoRoot, dates);
  const { startMs, endMs } = windowBounds(opts.endDate, opts.graceDays ?? 30);
  const out: BriefRawItem[] = [];
  for (const item of items) {
    if (!isSignalItem(item)) continue;
    // Reading a file by discovery date is not enough: a re-surfaced story
    // can carry a published_at from months ago. Enforce the recency floor.
    if (!isFresh(item, startMs, endMs)) continue;
    out.push({
      id: item.id,
      feed_kind: "committee_signal",
      subkind: scopeOf(item) === "committee" ? "committee_body" : "member",
      title: item.title,
      url: canonicalUrl(item.url),
      published_at: item.published_at,
      snippet: item.snippet,
      match_reason: item.match_reason,
      discovered_at: item.discovered_at,
      member_id: item.member_id,
    });
  }
  return { items: out, windowDates: dates };
}
