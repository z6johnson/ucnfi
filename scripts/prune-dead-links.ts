/**
 * One-shot cleanup: purge dead links from the activity ledger.
 *
 * The Tier-2 web search used to store URLs the model fabricated — it knows an
 * article's content from live grounding but guessed the URL from the site's
 * URL pattern, so many stored links 404. The scan/brief collectors now drop
 * dead links at collection time (lib/search/grounded-search.ts dropDeadUrls);
 * this script cleans up the links already written to disk before that fix.
 *
 * For every data/ucnfi-committee/activity/items/<date>.jsonl file it fetches
 * each item's URL and removes the ones that are definitively dead (HTTP
 * 404/410) — same rule as the live collectors. Purged ids are also removed
 * from the seen-ledger so a later scan can re-admit the story if the model
 * then yields a valid URL.
 *
 * Usage:
 *   npm run prune:dead-links
 *   DRY_RUN=1 npm run prune:dead-links   # report only, write nothing
 */

import { writeFileSync } from "node:fs";

import {
  type ActivityItem,
  itemsPath,
  listItemDates,
  readItemsForDates,
  readSeen,
  writeSeen,
} from "../lib/activity.ts";
import { dropDeadUrls } from "../lib/search/grounded-search.ts";

const REPO_ROOT = process.cwd();
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function rewriteItemsFile(isoDate: string, items: ActivityItem[]): void {
  const p = itemsPath(REPO_ROOT, isoDate);
  const body = items.map((i) => JSON.stringify(i)).join("\n") + (items.length > 0 ? "\n" : "");
  writeFileSync(p, body, "utf-8");
}

async function main(): Promise<void> {
  const dates = listItemDates(REPO_ROOT);
  console.info(`[prune] scanning ${dates.length} item file(s) dry_run=${DRY_RUN}`);

  const purgedIds = new Set<string>();
  let totalItems = 0;
  let totalDropped = 0;

  for (const date of dates) {
    const items = readItemsForDates(REPO_ROOT, [date]);
    if (items.length === 0) continue;
    totalItems += items.length;

    const kept = await dropDeadUrls(items, (m) => console.warn(`[prune] ${date} ${m}`));
    const keptIds = new Set(kept.map((i) => i.id));
    const droppedForDate = items.filter((i) => !keptIds.has(i.id));
    for (const d of droppedForDate) purgedIds.add(d.id);
    totalDropped += droppedForDate.length;

    if (droppedForDate.length === 0) continue;
    console.info(`[prune] ${date} dropped=${droppedForDate.length} kept=${kept.length}`);
    if (!DRY_RUN) rewriteItemsFile(date, kept);
  }

  console.info(`[prune] checked ${totalItems} item(s), dead ${totalDropped}`);

  if (purgedIds.size > 0 && !DRY_RUN) {
    const seen = readSeen(REPO_ROOT);
    let removed = 0;
    for (const id of purgedIds) {
      if (seen[id]) {
        delete seen[id];
        removed++;
      }
    }
    writeSeen(REPO_ROOT, seen);
    console.info(`[prune] removed ${removed} id(s) from seen ledger`);
  }

  if (DRY_RUN) console.info("[prune] dry run — no files written.");
}

main().catch((err) => {
  console.error("[prune] fatal:", err);
  process.exit(1);
});
