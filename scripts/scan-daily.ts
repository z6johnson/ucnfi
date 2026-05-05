/**
 * Daily committee AI-activity scan.
 *
 * Walks every committee member, runs Tier-1 feed collectors (RSS/Atom,
 * arXiv) and Tier-2 web search via the direct Anthropic API in
 * parallel with a concurrency cap, dedupes against the seen-ledger,
 * and appends new items to today's JSONL file under
 * data/ucnfi-committee/activity/items/.
 *
 * Usage:
 *   npm run scan:daily
 *   MEMBER_FILTER=hagberg-a npm run scan:daily         # one member
 *   TIER=1 npm run scan:daily                          # tier-1 only
 *   DRY_RUN=1 npm run scan:daily                       # collect, don't write
 *
 * Env required (when tier-2 is enabled):
 *   ANTHROPIC_API_KEY — for tier-2 web search
 *
 * Optional:
 *   SCAN_MODEL        — defaults to claude-opus-4-6
 *   LOOKBACK_DAYS     — overrides defaults: 2 (RSS), 7 (arXiv), 7 (tier-2).
 *                       Set to 30 for a one-shot backfill seed.
 *   CONCURRENCY       — default 5
 */

import {
  type ActivityItem,
  appendItems,
  isoDateUTC,
  isoNowUTC,
  pruneSeen,
  readFeedsConfig,
  readSeen,
  writeSeen,
} from "../lib/activity.ts";
import { type CommitteeMember, listMembers } from "../lib/committee.ts";
import { collectTier1 } from "../lib/scan/feeds.ts";
import { collectTier2 } from "../lib/scan/websearch.ts";

const REPO_ROOT = process.cwd();
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const MEMBER_FILTER = process.env.MEMBER_FILTER?.trim() || null;
const TIER = (process.env.TIER ?? "both").toLowerCase();
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 5) | 0);
const LOOKBACK_DAYS = process.env.LOOKBACK_DAYS ? Number(process.env.LOOKBACK_DAYS) : undefined;
const LEDGER_RETENTION_DAYS = 90;

type MemberResult = {
  memberId: string;
  tier1: ActivityItem[];
  tier2: ActivityItem[];
  errors: string[];
};

async function processMember(member: CommitteeMember, feedsConfig: ReturnType<typeof readFeedsConfig>): Promise<MemberResult> {
  const result: MemberResult = {
    memberId: member.member_id,
    tier1: [],
    tier2: [],
    errors: [],
  };
  const cfg = feedsConfig[member.member_id];

  if (TIER === "1" || TIER === "both") {
    try {
      result.tier1 = await collectTier1(member.member_id, cfg, {
        lookbackDays: LOOKBACK_DAYS,
      });
    } catch (err) {
      result.errors.push(`tier1: ${(err as Error).message}`);
    }
  }

  if (TIER === "2" || TIER === "both") {
    if (!process.env.ANTHROPIC_API_KEY) {
      result.errors.push("tier2: ANTHROPIC_API_KEY not set, skipped");
    } else {
      try {
        result.tier2 = await collectTier2(member, {
          searchAliases: cfg?.search_aliases ?? [],
          lookbackDays: LOOKBACK_DAYS,
        });
      } catch (err) {
        result.errors.push(`tier2: ${(err as Error).message}`);
      }
    }
  }
  return result;
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  async function next(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i]);
    }
  }
  const runners: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    runners.push(next());
  }
  await Promise.all(runners);
  return out;
}

async function main(): Promise<void> {
  const allMembers = listMembers();
  const members = MEMBER_FILTER
    ? allMembers.filter((m) => m.member_id === MEMBER_FILTER)
    : allMembers;

  if (members.length === 0) {
    console.error(`No members matched filter=${MEMBER_FILTER ?? "*"}.`);
    process.exit(2);
  }

  const feedsConfig = readFeedsConfig(REPO_ROOT);
  const seen = readSeen(REPO_ROOT);
  const today = isoDateUTC();
  const now = isoNowUTC();

  console.info(
    `[scan] start date=${today} members=${members.length} tier=${TIER} concurrency=${CONCURRENCY} dry_run=${DRY_RUN}`,
  );

  const results = await runWithConcurrency(
    members,
    (m) => processMember(m, feedsConfig),
    CONCURRENCY,
  );

  // Dedupe: only keep items whose id is not in `seen`. Items new to this
  // run are appended to the ledger immediately so duplicates within the
  // same run (e.g., same URL surfaced by both tiers) collapse correctly.
  const newItems: ActivityItem[] = [];
  for (const r of results) {
    for (const item of [...r.tier1, ...r.tier2]) {
      if (seen[item.id]) continue;
      seen[item.id] = now;
      newItems.push(item);
    }
  }

  // Per-member counts for the run summary.
  const summary: Array<{ id: string; t1: number; t2: number; new: number; errors: string[] }> = [];
  for (const r of results) {
    const newForMember = newItems.filter((i) => i.member_id === r.memberId).length;
    summary.push({
      id: r.memberId,
      t1: r.tier1.length,
      t2: r.tier2.length,
      new: newForMember,
      errors: r.errors,
    });
  }
  for (const s of summary) {
    const errPart = s.errors.length > 0 ? ` errors=[${s.errors.join("; ")}]` : "";
    console.info(`[scan] ${s.id} t1=${s.t1} t2=${s.t2} new=${s.new}${errPart}`);
  }
  console.info(`[scan] total_new=${newItems.length}`);

  if (DRY_RUN) {
    console.info("[scan] dry run — not writing items or ledger.");
    return;
  }

  if (newItems.length > 0) {
    appendItems(REPO_ROOT, today, newItems);
    console.info(`[scan] appended ${newItems.length} item(s) to items/${today}.jsonl`);
  }

  pruneSeen(seen, LEDGER_RETENTION_DAYS);
  writeSeen(REPO_ROOT, seen);
  console.info(`[scan] wrote seen ledger size=${Object.keys(seen).length}`);
}

main().catch((err) => {
  console.error("[scan] fatal:", err);
  process.exit(1);
});
