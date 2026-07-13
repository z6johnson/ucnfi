/**
 * Git merge driver for the committee-scan activity data files.
 *
 * Wired up by the committee-scan workflow so the rebase-and-retry push
 * loop (.github/workflows/committee-scan.yml) can auto-resolve conflicts
 * between two racing scan runs instead of aborting the rebase:
 *   - seen.json          → union of both ledgers (earliest first-seen wins)
 *   - items/<date>.jsonl → union of both files, deduped by item id
 *
 * .gitattributes points those paths at the `ucnfi-seen` / `ucnfi-jsonl`
 * driver names, and the workflow binds each name to:
 *   node --experimental-strip-types --no-warnings \
 *     scripts/merge-activity.ts <seen|jsonl> %O %A %B
 * Git substitutes %O (ancestor), %A (our version / result), %B (theirs)
 * with temp file paths. We overwrite %A with the merged content and exit
 * 0 to tell git the conflict is resolved. The ancestor is intentionally
 * unused: both files are grow-only, so a union is always correct.
 */

import { readFileSync, writeFileSync } from "node:fs";

import type { SeenLedger } from "../lib/activity.ts";
import { mergeItemLines, mergeSeenLedgers } from "../lib/scan/merge.ts";

function readLedger(path: string): SeenLedger {
  try {
    const raw = readFileSync(path, "utf-8").trim();
    return raw ? (JSON.parse(raw) as SeenLedger) : {};
  } catch {
    return {};
  }
}

function main(): void {
  const [mode, , ours, theirs] = process.argv.slice(2);
  if (!mode || !ours || !theirs) {
    console.error("usage: merge-activity.ts <seen|jsonl> %O %A %B");
    process.exit(2);
  }

  if (mode === "seen") {
    const merged = mergeSeenLedgers(readLedger(ours), readLedger(theirs));
    writeFileSync(ours, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  } else if (mode === "jsonl") {
    const merged = mergeItemLines(readFileSync(ours, "utf-8"), readFileSync(theirs, "utf-8"));
    writeFileSync(ours, merged, "utf-8");
  } else {
    console.error(`merge-activity.ts: unknown mode "${mode}"`);
    process.exit(2);
  }
}

main();
