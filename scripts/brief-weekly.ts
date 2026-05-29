/**
 * Weekly UC President's Brief — generator entry point.
 *
 * Pulls four feeds (external / peer / vendor / committee signal),
 * drafts three to five items with Claude via the UCSD TritonAI
 * LiteLLM proxy, validates every baseline anchor, and writes a draft
 * markdown edition under data/brief/editions/.
 *
 * Usage:
 *   npm run brief:weekly
 *   END_DATE=2026-05-29 npm run brief:weekly        # week ending on a specific date
 *   DRY_RUN=1 npm run brief:weekly                  # build, print, don't write
 *   LOOKBACK_DAYS=14 npm run brief:weekly           # widen the feed window
 *
 * Env required:
 *   LITELLM_API_KEY
 *
 * Optional:
 *   BRIEF_MODEL          — defaults to CLAUDE_MODEL
 *   END_DATE             — YYYY-MM-DD, defaults to today
 *   LOOKBACK_DAYS        — external/peer/vendor feed lookback, default 7
 *   COMMITTEE_GRACE_DAYS — committee-signal publication-recency window, default 30
 *                          (wider than LOOKBACK_DAYS because member positions
 *                          often surface in a scan after they were published)
 *
 * The generated draft is NOT visible on /brief until a human reviewer
 * edits the file, sets status: "published" in the frontmatter, fills
 * reviewed_by + reviewed_at, and commits. That's the "AI-assembled,
 * human-accountable" gate.
 */

import { existsSync, readFileSync } from "node:fs";

import { isoNowUTC } from "../lib/activity.ts";
import { generateBrief } from "../lib/brief/generate.ts";
import {
  rejectedPath,
  serializeEdition,
  sourcesConfigPath,
  writeEdition,
  writeRejected,
} from "../lib/brief/storage.ts";
import type { SourcesConfig } from "../lib/brief/types.ts";

const REPO_ROOT = process.cwd();
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const END_DATE_RAW = process.env.END_DATE?.trim() || null;
const LOOKBACK_DAYS = process.env.LOOKBACK_DAYS ? Number(process.env.LOOKBACK_DAYS) : 7;
const COMMITTEE_GRACE_DAYS = process.env.COMMITTEE_GRACE_DAYS
  ? Number(process.env.COMMITTEE_GRACE_DAYS)
  : 30;

function parseEndDate(): Date {
  if (!END_DATE_RAW) return new Date();
  const t = Date.parse(END_DATE_RAW + "T12:00:00Z");
  if (!Number.isFinite(t)) {
    console.error(`[brief] invalid END_DATE=${END_DATE_RAW}; expected YYYY-MM-DD`);
    process.exit(2);
  }
  return new Date(t);
}

function loadSourcesConfig(): SourcesConfig {
  const p = sourcesConfigPath(REPO_ROOT);
  if (!existsSync(p)) {
    console.error(`[brief] sources_config.json not found at ${p}`);
    process.exit(2);
  }
  const raw = readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as Partial<SourcesConfig>;
  return {
    external: parsed.external ?? [],
    vendor: parsed.vendor ?? [],
    peers: parsed.peers ?? [],
  };
}

async function main(): Promise<void> {
  const endDate = parseEndDate();
  const config = loadSourcesConfig();

  console.info(
    `[brief] start end_date=${endDate.toISOString().slice(0, 10)} ` +
      `external=${config.external.length} vendor=${config.vendor.length} ` +
      `peers=${config.peers.length} lookback=${LOOKBACK_DAYS} ` +
      `committee_grace=${COMMITTEE_GRACE_DAYS} dry_run=${DRY_RUN}`,
  );

  const { edition, validation, rawItems } = await generateBrief({
    repoRoot: REPO_ROOT,
    endDate,
    config,
    feedLookbackDays: LOOKBACK_DAYS,
    committeeGraceDays: COMMITTEE_GRACE_DAYS,
  });

  console.info(
    `[brief] collected raw=${rawItems.length} ` +
      `(external=${edition.inputs_manifest.external.n} ` +
      `peer=${edition.inputs_manifest.peer.n} ` +
      `vendor=${edition.inputs_manifest.vendor.n} ` +
      `committee=${edition.inputs_manifest.committee_signal_dates.length} dates)`,
  );
  console.info(
    `[brief] drafted week=${edition.edition_id} accepted=${validation.accepted.length} rejected=${validation.rejected.length}`,
  );
  for (const r of validation.rejected) {
    console.warn(`[brief]   rejected "${r.item.headline}": ${r.reasons.join("; ")}`);
  }

  if (DRY_RUN) {
    console.info("[brief] dry run — edition follows:");
    console.info("---");
    console.info(serializeEdition(edition));
    return;
  }

  const out = writeEdition(REPO_ROOT, edition);
  console.info(`[brief] wrote ${out}`);

  if (validation.rejected.length > 0) {
    const rejectedFile = writeRejected(REPO_ROOT, edition.edition_id, {
      edition_id: edition.edition_id,
      rejected_at: isoNowUTC(),
      items: validation.rejected.map((r) => ({
        headline: r.item.headline,
        reasons: r.reasons,
        raw: r.item,
      })),
    });
    console.info(`[brief] wrote rejection sidecar ${rejectedFile}`);
  } else {
    // No rejections; leave any stale sidecar alone (the reviewer can
    // delete it manually if it's confusing).
    const staleSidecar = rejectedPath(REPO_ROOT, edition.edition_id);
    if (existsSync(staleSidecar)) {
      console.info(`[brief] note: stale rejection sidecar exists at ${staleSidecar}`);
    }
  }

  console.info(
    `[brief] draft is at data/brief/editions/${edition.edition_id}.md with status=draft. Edit the prose, set status to "published", fill reviewed_by + reviewed_at, then commit.`,
  );
}

main().catch((err) => {
  console.error("[brief] fatal:", err);
  process.exit(1);
});
