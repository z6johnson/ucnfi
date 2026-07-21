/**
 * Shared types and helpers for the committee AI-activity scan.
 *
 * Used by both the daily scan (lib/scan/feeds.ts, lib/scan/websearch.ts,
 * scripts/scan-daily.ts) and the weekly digest (lib/scan/digest.ts,
 * scripts/digest-weekly.ts).
 *
 * No "server-only" import: this module is consumed by Node CLI scripts
 * via --experimental-strip-types, not just the Next.js bundle.
 */

import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ActivityTier = 1 | 2;

export type ActivitySourceKind =
  | "rss"
  | "arxiv"
  | "scholar"
  | "websearch"
  | "social"
  | "manual";

export type ActivityScope = "member" | "committee" | "topic";

// Synthetic scope ids live in a dependency-free module so client components
// can import them without pulling node:fs into the browser bundle. Imported
// here for internal use (scopeOf) and re-exported for existing callers.
import { COMMITTEE_SCOPE_ID, TOPIC_SCOPE_ID } from "./scopes.ts";
export { COMMITTEE_SCOPE_ID, TOPIC_SCOPE_ID };

export type ActivityItem = {
  id: string;
  member_id: string;
  /**
   * Optional. Items written before the committee-scope rollout don't
   * have this field; treat absent as "member". Use `scopeOf(item)` to
   * read it safely.
   */
  scope?: ActivityScope;
  tier: ActivityTier;
  source_kind: ActivitySourceKind;
  title: string;
  url: string;
  published_at: string | null;
  snippet: string;
  match_reason: string;
  discovered_at: string;
};

export function scopeOf(item: ActivityItem): ActivityScope {
  if (item.scope) return item.scope;
  if (item.member_id === COMMITTEE_SCOPE_ID) return "committee";
  if (item.member_id === TOPIC_SCOPE_ID) return "topic";
  return "member";
}

export type FeedConfig = {
  rss?: string[];
  arxiv_author?: string | null;
  scholar_id?: string | null;
  /** Social/owned-media accounts; passed to tier-2 search to target directly. */
  x_handle?: string | null;
  linkedin?: string | null;
  bluesky?: string | null;
  youtube?: string | null;
  search_aliases?: string[];
};

export type FeedConfigMap = Record<string, FeedConfig>;

export type SeenLedger = Record<string, string>;

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

export function activityRoot(repoRoot: string): string {
  return join(repoRoot, "data", "ucnfi-committee", "activity");
}

export function feedsConfigPath(repoRoot: string): string {
  return join(repoRoot, "data", "ucnfi-committee", "feeds.json");
}

export function seenPath(repoRoot: string): string {
  return join(activityRoot(repoRoot), "seen.json");
}

export function itemsPath(repoRoot: string, isoDate: string): string {
  return join(activityRoot(repoRoot), "items", `${isoDate}.jsonl`);
}

export function digestPath(repoRoot: string, isoWeek: string): string {
  return join(activityRoot(repoRoot), "digests", `${isoWeek}.md`);
}

/* ------------------------------------------------------------------ */
/* Hashing & URL canonicalisation                                      */
/* ------------------------------------------------------------------ */

/**
 * Lower-cases the host, drops the fragment, removes common tracking
 * params, and trims a trailing slash. Two URLs that point at the same
 * resource through different campaigns should produce the same id.
 */
export function canonicalUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw.trim();
  }
  parsed.hash = "";
  parsed.host = parsed.host.toLowerCase();
  const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "ref_src"];
  for (const k of drop) parsed.searchParams.delete(k);
  let s = parsed.toString();
  if (s.endsWith("/") && parsed.pathname !== "/") s = s.slice(0, -1);
  return s;
}

export function itemId(url: string): string {
  return createHash("sha256").update(canonicalUrl(url)).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Feed config                                                         */
/* ------------------------------------------------------------------ */

export function readFeedsConfig(repoRoot: string): FeedConfigMap {
  const p = feedsConfigPath(repoRoot);
  if (!existsSync(p)) return {};
  const raw = readFileSync(p, "utf-8");
  return JSON.parse(raw) as FeedConfigMap;
}

/* ------------------------------------------------------------------ */
/* Seen ledger                                                         */
/* ------------------------------------------------------------------ */

export function readSeen(repoRoot: string): SeenLedger {
  const p = seenPath(repoRoot);
  if (!existsSync(p)) return {};
  const raw = readFileSync(p, "utf-8");
  return JSON.parse(raw) as SeenLedger;
}

export function writeSeen(repoRoot: string, ledger: SeenLedger): void {
  const p = seenPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
}

/** Drop ids first seen more than `days` ago. Mutates and returns the ledger. */
export function pruneSeen(ledger: SeenLedger, days: number): SeenLedger {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const [id, ts] of Object.entries(ledger)) {
    const t = Date.parse(ts);
    if (Number.isFinite(t) && t < cutoff) delete ledger[id];
  }
  return ledger;
}

/* ------------------------------------------------------------------ */
/* JSONL writers / readers                                             */
/* ------------------------------------------------------------------ */

export function appendItems(
  repoRoot: string,
  isoDate: string,
  items: ActivityItem[],
): void {
  if (items.length === 0) return;
  const p = itemsPath(repoRoot, isoDate);
  mkdirSync(dirname(p), { recursive: true });
  const lines = items.map((i) => JSON.stringify(i)).join("\n") + "\n";
  appendFileSync(p, lines, "utf-8");
}

export function readItemsForDates(
  repoRoot: string,
  isoDates: string[],
): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const d of isoDates) {
    const p = itemsPath(repoRoot, d);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as ActivityItem);
      } catch {
        // Skip malformed lines rather than crash the digest.
      }
    }
  }
  return out;
}

/** Returns the ISO dates (YYYY-MM-DD) of the items/ jsonl files on disk. */
export function listItemDates(repoRoot: string): string[] {
  const dir = join(activityRoot(repoRoot), "items");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.slice(0, -".jsonl".length))
    .sort();
}

/** Returns the ISO-week labels (YYYY-Www) of the digests/ markdown files, sorted ascending. */
export function listDigestWeeks(repoRoot: string): string[] {
  const dir = join(activityRoot(repoRoot), "digests");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -".md".length))
    .sort();
}

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

export function isoDateUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isoNowUTC(d: Date = new Date()): string {
  return d.toISOString();
}

/**
 * ISO-week label for `d`, in the form "YYYY-Www" (e.g. "2026-W18").
 * Matches the ISO 8601 week numbering used by `git log --date=iso`.
 */
export function isoWeekLabel(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Discovery-based freshness (/activity feed)                          */
/* ------------------------------------------------------------------ */

/** Max days an article may predate its discovery and still count as "new activity". */
export const ACTIVITY_STALENESS_CAP_DAYS = 30;

/**
 * Discovery-based freshness for the /activity feed: the item was discovered_at
 * within [startMs, endMs], AND (if it has a publish date) wasn't published more
 * than `maxStaleDays` before it was discovered — so a scan that surfaces a
 * genuinely ancient article doesn't jump to the top of the feed.
 *
 * This is deliberately distinct from `isFresh` in lib/brief/recency.ts, which
 * windows on the article's own publish date for the weekly Brief. The Activity
 * feed instead answers "what did the scan turn up recently?".
 */
export function isDiscoveredFresh(
  item: { published_at: string | null; discovered_at: string },
  startMs: number,
  endMs: number,
  maxStaleDays: number = ACTIVITY_STALENESS_CAP_DAYS,
): boolean {
  const disc = Date.parse(item.discovered_at);
  if (!Number.isFinite(disc)) return false;
  if (disc < startMs || disc > endMs) return false;
  if (item.published_at) {
    const pub = Date.parse(item.published_at);
    if (Number.isFinite(pub) && disc - pub > maxStaleDays * 86_400_000) return false;
  }
  return true;
}

/** Returns the ISO dates for the seven days ending on `endDate` inclusive. */
export function lastNDates(n: number, endDate: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(isoDateUTC(d));
  }
  return out;
}
