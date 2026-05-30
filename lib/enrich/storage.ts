/**
 * Changeset storage.
 *
 * A changeset is the reviewable proposal the monthly run produces. It lives
 * at data/enrich/changesets/{changeset_id}.md and — like a Brief edition —
 * has JSON frontmatter (unambiguous nested change data) plus a markdown body
 * the reviewer reads and annotates:
 *
 *   ---
 *   { ...ChangesetMeta + changes + decisions as JSON... }
 *   ---
 *
 *   ## uc_merced.governance.has_ai_council — new_field
 *   - value: true
 *   - current: (none)
 *   - source: disc-uc_merced-1 (https://…)
 *   - confidence: high
 *   - status: accepted
 *   - notes: UC Merced AI Advisory Council formed 2026-02-11 …
 *   - DECISION: accept
 *
 * The reviewer changes `DECISION:` lines (accept | reject | review), sets
 * reviewed_by/reviewed_at in the frontmatter, and commits. parseChangeset
 * reads the body DECISIONs back (they override the frontmatter defaults), so
 * editing the markdown IS the approval UX — the same contract as the Brief.
 *
 * Rejected candidates never appear here; they go to {changeset_id}.rejected.json.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { changeId, type Changeset, type ChangesetMeta, type ProposedChange } from "./types.ts";

export type Decision = "accept" | "reject" | "review";

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

export function enrichRoot(repoRoot: string): string {
  return join(repoRoot, "data", "enrich");
}

export function changesetsDir(repoRoot: string): string {
  return join(enrichRoot(repoRoot), "changesets");
}

export function changesetPath(repoRoot: string, changesetId: string): string {
  return join(changesetsDir(repoRoot), `${changesetId}.md`);
}

export function rejectedPath(repoRoot: string, changesetId: string): string {
  return join(changesetsDir(repoRoot), `${changesetId}.rejected.json`);
}

/* ------------------------------------------------------------------ */
/* Frontmatter                                                         */
/* ------------------------------------------------------------------ */

type FrontmatterShape = ChangesetMeta & {
  changes: Record<string, ProposedChange>;
  decisions: Record<string, Decision>;
};

const FENCE = "---";

/** Default decision for a freshly-generated change, from its status. */
export function defaultDecision(change: ProposedChange): Decision {
  if (change.status === "accepted") return "accept";
  if (change.status === "rejected") return "reject";
  return "review";
}

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

function fmtValue(v: unknown): string {
  return JSON.stringify(v);
}

export function serializeChangeset(
  changeset: Changeset,
  decisions?: Record<string, Decision>,
): string {
  const changesMap: Record<string, ProposedChange> = {};
  const decisionMap: Record<string, Decision> = {};
  for (const change of changeset.changes) {
    const id = changeId(change);
    changesMap[id] = change;
    decisionMap[id] = decisions?.[id] ?? defaultDecision(change);
  }

  const fm: FrontmatterShape = {
    changeset_id: changeset.changeset_id,
    target: changeset.target,
    run_date: changeset.run_date,
    status: changeset.status,
    reviewed_by: changeset.reviewed_by,
    reviewed_at: changeset.reviewed_at,
    applied_at: changeset.applied_at,
    generated_at: changeset.generated_at,
    generated_by_model: changeset.generated_by_model,
    base_version: changeset.base_version,
    target_version: changeset.target_version,
    inputs_manifest: changeset.inputs_manifest,
    changes: changesMap,
    decisions: decisionMap,
  };

  const body: string[] = [];
  body.push(
    `# Proposed changes — ${changeset.target} — ${changeset.changeset_id}`,
    "",
    `Generated ${changeset.generated_at} by ${changeset.generated_by_model}. ` +
      `Status: **${changeset.status}**. Edit each \`DECISION:\` line ` +
      `(accept | reject | review), set \`reviewed_by\`/\`reviewed_at\` in the ` +
      `frontmatter, commit, then run \`npm run enrich:apply -- --changeset ` +
      `${changeset.changeset_id}\`.`,
    "",
  );
  for (const change of changeset.changes) {
    const id = changeId(change);
    body.push(`## ${id} — ${change.change_kind}`);
    body.push(`- value: ${fmtValue(change.record.value)}`);
    body.push(
      `- current: ${change.current_record ? fmtValue(change.current_record.value) : "(none)"}`,
    );
    body.push(`- source: ${change.record.source_id} (${change.record.source_url ?? "—"})`);
    body.push(`- confidence: ${change.confidence}`);
    body.push(`- status: ${change.status}`);
    if (change.validation_reasons.length > 0) {
      body.push(`- flags: ${change.validation_reasons.join("; ")}`);
    }
    body.push(`- notes: ${change.record.notes ?? ""}`);
    body.push(`- DECISION: ${decisionMap[id]}`);
    body.push("");
  }

  return `${FENCE}\n${JSON.stringify(fm, null, 2)}\n${FENCE}\n\n${body.join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export class ChangesetParseError extends Error {}

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  if (!text.startsWith(FENCE)) {
    throw new ChangesetParseError("Changeset must start with `---` frontmatter fence");
  }
  const afterOpen = text.indexOf("\n", FENCE.length);
  if (afterOpen === -1) throw new ChangesetParseError("Truncated after opening fence");
  const closeIdx = text.indexOf(`\n${FENCE}`, afterOpen);
  if (closeIdx === -1) throw new ChangesetParseError("Missing closing `---` fence");
  const frontmatter = text.slice(afterOpen + 1, closeIdx).trim();
  let bodyStart = closeIdx + 1 + FENCE.length;
  while (text[bodyStart] === "\n" || text[bodyStart] === "\r") bodyStart += 1;
  return { frontmatter, body: text.slice(bodyStart) };
}

/** Reads `DECISION:` lines from the body, keyed by the preceding `## <id>` heading. */
function parseBodyDecisions(body: string): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  let currentId: string | null = null;
  for (const line of body.split("\n")) {
    const head = /^##\s+([A-Za-z0-9_.-]+)\s+—/.exec(line);
    if (head) {
      currentId = head[1];
      continue;
    }
    const dec = /^-\s*DECISION:\s*(accept|reject|review)\s*$/i.exec(line);
    if (dec && currentId) {
      out[currentId] = dec[1].toLowerCase() as Decision;
    }
  }
  return out;
}

export type ParsedChangeset = {
  changeset: Changeset;
  /** Final per-change decisions, body overriding frontmatter defaults. */
  decisions: Record<string, Decision>;
};

export function parseChangeset(text: string): ParsedChangeset {
  const { frontmatter, body } = splitFrontmatter(text);
  let fm: FrontmatterShape;
  try {
    fm = JSON.parse(frontmatter) as FrontmatterShape;
  } catch (err) {
    throw new ChangesetParseError(`Frontmatter JSON parse failed: ${(err as Error).message}`);
  }

  const changes = Object.values(fm.changes ?? {});
  const decisions: Record<string, Decision> = { ...(fm.decisions ?? {}) };
  // Body DECISIONs are the human's edits and take precedence.
  for (const [id, d] of Object.entries(parseBodyDecisions(body))) decisions[id] = d;

  const changeset: Changeset = {
    changeset_id: fm.changeset_id,
    target: fm.target,
    run_date: fm.run_date,
    status: fm.status,
    reviewed_by: fm.reviewed_by ?? "",
    reviewed_at: fm.reviewed_at ?? "",
    applied_at: fm.applied_at ?? "",
    generated_at: fm.generated_at,
    generated_by_model: fm.generated_by_model,
    base_version: fm.base_version,
    target_version: fm.target_version ?? "",
    inputs_manifest: fm.inputs_manifest,
    changes,
  };
  return { changeset, decisions };
}

/* ------------------------------------------------------------------ */
/* I/O                                                                 */
/* ------------------------------------------------------------------ */

export function writeChangeset(
  repoRoot: string,
  changeset: Changeset,
  decisions?: Record<string, Decision>,
): string {
  const p = changesetPath(repoRoot, changeset.changeset_id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, serializeChangeset(changeset, decisions), "utf-8");
  return p;
}

export function readChangeset(repoRoot: string, changesetId: string): ParsedChangeset | null {
  const p = changesetPath(repoRoot, changesetId);
  if (!existsSync(p)) return null;
  return parseChangeset(readFileSync(p, "utf-8"));
}

export function listChangesetIds(repoRoot: string): string[] {
  const dir = changesetsDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -".md".length))
    .sort();
}

/* ------------------------------------------------------------------ */
/* Rejected sidecar                                                    */
/* ------------------------------------------------------------------ */

export type RejectedRecord = {
  changeset_id: string;
  rejected_at: string;
  candidates: Array<{
    entity_id: string;
    dimension: string;
    field: string;
    reasons: string[];
    raw: unknown;
  }>;
};

export function writeRejected(
  repoRoot: string,
  changesetId: string,
  record: RejectedRecord,
): string {
  const p = rejectedPath(repoRoot, changesetId);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(record, null, 2) + "\n", "utf-8");
  return p;
}
