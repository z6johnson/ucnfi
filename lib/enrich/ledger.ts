/**
 * Source-freshness ledger for the enrichment pipeline.
 *
 * Tracks, per source URL, the last fetch outcome and a content hash so the
 * monthly run can detect (a) CHANGED sources (hash differs → re-extract)
 * and (b) DEAD sources (repeated failures → propose a value:false gap for
 * any field that source currently backs).
 *
 * Reuses canonicalUrl + itemId from lib/activity.ts verbatim, so the ledger
 * keys match the rest of the project's URL-dedup scheme.
 *
 * Storage: data/enrich/source_ledger.json — pretty JSON + trailing newline,
 * identical in spirit to data/ucnfi-committee/activity/seen.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { canonicalUrl, itemId } from "../activity.ts";

/** Number of consecutive failed fetches before a source is considered dead. */
export const DEAD_THRESHOLD = 2;

export type SourceLedgerEntry = {
  source_id: string;
  url: string;
  /** sha256 of the last successfully fetched body, or null if never fetched OK. */
  content_hash: string | null;
  last_fetched: string; // ISO timestamp
  last_status: number | "error" | "dead";
  /** When content_hash last changed (ISO), or null. */
  last_changed: string | null;
  first_seen: string; // ISO timestamp
  consecutive_failures: number;
};

export type SourceLedger = Record<string, SourceLedgerEntry>;

export function ledgerPath(repoRoot: string): string {
  return join(repoRoot, "data", "enrich", "source_ledger.json");
}

export function readLedger(repoRoot: string): SourceLedger {
  const p = ledgerPath(repoRoot);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf-8")) as SourceLedger;
}

export function writeLedger(repoRoot: string, ledger: SourceLedger): void {
  const p = ledgerPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
}

/** Ledger key for a URL — the same SHA256-of-canonical-URL id used elsewhere. */
export function ledgerKey(url: string): string {
  return itemId(url);
}

export type FreshnessVerdict =
  | "first_seen"
  | "unchanged"
  | "changed"
  | "transient_failure"
  | "dead";

/**
 * Records a fetch outcome into the ledger and returns the freshness verdict.
 * Mutates `ledger` in place. `nowIso` is injected for deterministic tests.
 */
export function recordFetch(
  ledger: SourceLedger,
  args: {
    source_id: string;
    url: string;
    ok: boolean;
    status: number | "error";
    contentHash: string | null;
    nowIso: string;
  },
): FreshnessVerdict {
  const key = ledgerKey(args.url);
  const prior = ledger[key];

  if (!args.ok) {
    const failures = (prior?.consecutive_failures ?? 0) + 1;
    const dead = failures >= DEAD_THRESHOLD;
    ledger[key] = {
      source_id: args.source_id,
      url: canonicalUrl(args.url),
      content_hash: prior?.content_hash ?? null,
      last_fetched: args.nowIso,
      last_status: dead ? "dead" : args.status,
      last_changed: prior?.last_changed ?? null,
      first_seen: prior?.first_seen ?? args.nowIso,
      consecutive_failures: failures,
    };
    return dead ? "dead" : "transient_failure";
  }

  const isFirst = !prior || prior.content_hash === null;
  const changed = !isFirst && prior.content_hash !== args.contentHash;
  ledger[key] = {
    source_id: args.source_id,
    url: canonicalUrl(args.url),
    content_hash: args.contentHash,
    last_fetched: args.nowIso,
    last_status: args.status,
    last_changed: changed ? args.nowIso : (prior?.last_changed ?? args.nowIso),
    first_seen: prior?.first_seen ?? args.nowIso,
    consecutive_failures: 0,
  };
  if (isFirst) return "first_seen";
  return changed ? "changed" : "unchanged";
}

/** Drop entries last fetched more than `days` ago. Mutates and returns. */
export function pruneLedger(ledger: SourceLedger, days: number): SourceLedger {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const [k, entry] of Object.entries(ledger)) {
    const t = Date.parse(entry.last_fetched);
    if (Number.isFinite(t) && t < cutoff) delete ledger[k];
  }
  return ledger;
}
