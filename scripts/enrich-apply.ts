/**
 * Apply a reviewed enrichment changeset to the canonical data.
 *
 * Human-run, never on cron. Refuses unless the changeset is status:draft and
 * a human filled reviewed_by. Applies the accepted changes, appends a version
 * section to data/ENRICHMENT_LOG.md, and (for baseline/peer) regenerates the
 * derived analytics via data/compute_derived.py.
 *
 * Usage:
 *   npm run enrich:apply -- --changeset 2026-06
 *   npm run enrich:apply -- --changeset 2026-06-peer
 *   npm run enrich:apply -- --changeset 2026-06-committee
 *
 * Before running: open data/enrich/changesets/<id>.md, set each DECISION:
 * line (accept | reject | review→accept/reject), and fill reviewed_by +
 * reviewed_at in the frontmatter, then commit.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { applyChangeset, ApplyGateError, type ApplySummary } from "../lib/enrich/apply.ts";
import { readChangeset } from "../lib/enrich/storage.ts";

const REPO_ROOT = process.cwd();

function parseChangesetId(): string {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--changeset");
  const id = i !== -1 ? argv[i + 1] : (argv[0] ?? "");
  if (!id) {
    console.error("[enrich-apply] missing --changeset <id>");
    process.exit(2);
  }
  return id;
}

function appendEnrichmentLog(summary: ApplySummary, runDate: string): void {
  const logPath = join(REPO_ROOT, "data", "ENRICHMENT_LOG.md");
  if (!existsSync(logPath)) return;
  const dims = Object.entries(summary.perDimension)
    .map(([d, n]) => `${d} +${n}`)
    .join(", ");
  const section =
    `\n- **v${summary.newVersion}** — Monthly automated enrichment applied ${runDate} ` +
    `(changeset \`${summary.changesetId}\`, target ${summary.target}). ` +
    `${summary.applied} human-approved changes (${summary.newFields} new fields, ` +
    `${summary.valueChanges} value updates) across ${summary.touchedEntities.length} entities. ` +
    `Per-dimension: ${dims || "n/a"}. ${summary.skipped} proposed changes were not approved. ` +
    `Reviewed changeset and rejection sidecar retained under data/enrich/changesets/.\n`;
  appendFileSync(logPath, section, "utf-8");
  console.info(`[enrich-apply] appended v${summary.newVersion} section to ENRICHMENT_LOG.md`);
}

function recomputeDerived(target: string): void {
  if (target !== "baseline") return; // derived analytics are computed off the UC baseline only
  const script = join(REPO_ROOT, "data", "compute_derived.py");
  if (!existsSync(script)) {
    console.warn("[enrich-apply] compute_derived.py not found — skipping derived recompute");
    return;
  }
  const res = spawnSync("python3", [script], { cwd: REPO_ROOT, stdio: "inherit" });
  if (res.status !== 0) {
    console.warn(`[enrich-apply] compute_derived.py exited ${res.status} — recompute derived manually`);
  } else {
    console.info("[enrich-apply] regenerated data/uc_ai_derived.json");
  }
}

function main(): void {
  const changesetId = parseChangesetId();
  const parsed = readChangeset(REPO_ROOT, changesetId);
  if (!parsed) {
    console.error(`[enrich-apply] changeset ${changesetId} not found under data/enrich/changesets/`);
    process.exit(2);
  }

  let summary: ApplySummary;
  try {
    summary = applyChangeset(REPO_ROOT, changesetId);
  } catch (err) {
    if (err instanceof ApplyGateError) {
      console.error(`[enrich-apply] gate: ${err.message}`);
      process.exit(3);
    }
    throw err;
  }

  console.info(
    `[enrich-apply] applied ${summary.applied} changes to ${summary.target} ` +
      `(v${summary.baseVersion} → v${summary.newVersion}); ${summary.skipped} not approved.`,
  );

  if (summary.applied > 0) {
    appendEnrichmentLog(summary, parsed.changeset.run_date);
    recomputeDerived(summary.target);
  }

  console.info(
    `[enrich-apply] done. Commit the canonical file, the updated changeset (status=applied), ` +
      `ENRICHMENT_LOG.md, and any regenerated derived JSON together.`,
  );
}

main();
