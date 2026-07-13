/**
 * Union merge helpers for the committee-scan activity data files.
 *
 * The daily scan commits two files that two concurrent runs (a scheduled
 * run racing a `workflow_dispatch`, or a retry racing the original) both
 * touch:
 *   - `seen.json`          — the whole file is rewritten each run.
 *   - `items/<date>.jsonl` — new items are appended to today's file.
 *
 * When one run pushes first, the other's rebase (see the retry loop in
 * .github/workflows/committee-scan.yml) hits a conflict git can't resolve
 * on its own. Both files are grow-only, so a union is always the correct
 * merge — these helpers implement it and back the git merge driver in
 * scripts/merge-activity.ts.
 */

import type { ActivityItem, SeenLedger } from "../activity.ts";

/**
 * Union two versions of the seen-ledger. When both sides recorded the
 * same id, keep the earlier timestamp: the ledger tracks first-seen, and
 * the ISO 8601 strings written by the scan compare chronologically as
 * plain text.
 */
export function mergeSeenLedgers(ours: SeenLedger, theirs: SeenLedger): SeenLedger {
  const out: SeenLedger = { ...ours };
  for (const [id, ts] of Object.entries(theirs)) {
    const existing = out[id];
    out[id] = existing === undefined || ts < existing ? ts : existing;
  }
  return out;
}

/**
 * Union two versions of a daily items JSONL file, deduping by item id.
 * Our lines are kept in order first, then any of theirs whose id we
 * haven't already seen. Lines that don't parse to an object with a
 * string id are keyed by their raw text so identical duplicates still
 * collapse but distinct ones survive.
 */
export function mergeItemLines(ours: string, theirs: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const src of [ours, theirs]) {
    for (const raw of src.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      let key: string;
      try {
        const parsed = JSON.parse(line) as Partial<ActivityItem>;
        key = typeof parsed.id === "string" && parsed.id ? parsed.id : `raw:${line}`;
      } catch {
        key = `raw:${line}`;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}
