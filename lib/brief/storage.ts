/**
 * Brief edition storage layer.
 *
 * Each edition lives at data/brief/editions/{edition_id}.md. The file
 * has two parts separated by `---` lines:
 *
 *   ---
 *   { ...edition + item metadata as JSON... }
 *   ---
 *
 *   ## item-1 — Headline
 *
 *   ### What happened
 *   Prose...
 *
 *   ### Why it matters to UC
 *   Prose...
 *
 *   ### For the committee
 *   Prose...
 *
 *   ## item-2 — Headline
 *   ...
 *
 * The frontmatter is JSON (not YAML) for unambiguous parsing of nested
 * anchors and arrays. The body is markdown so reviewers can edit prose
 * in their normal editor. Per-item metadata (anchors, sources, experts)
 * lives in the frontmatter keyed by item_id.
 *
 * No "server-only" import: read by both pages and the generation script.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type {
  BriefEdition,
  BriefEditionMeta,
  BriefItem,
  BriefItemMeta,
  BriefItemProse,
} from "./types.ts";

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

export function briefRoot(repoRoot: string): string {
  return join(repoRoot, "data", "brief");
}

export function editionsDir(repoRoot: string): string {
  return join(briefRoot(repoRoot), "editions");
}

export function editionPath(repoRoot: string, editionId: string): string {
  return join(editionsDir(repoRoot), `${editionId}.md`);
}

export function rejectedPath(repoRoot: string, editionId: string): string {
  return join(editionsDir(repoRoot), `${editionId}.rejected.json`);
}

export function sourcesDir(repoRoot: string, kind: string): string {
  return join(briefRoot(repoRoot), "sources", kind);
}

export function briefSeenPath(repoRoot: string): string {
  return join(briefRoot(repoRoot), "seen.json");
}

export function sourcesConfigPath(repoRoot: string): string {
  return join(briefRoot(repoRoot), "sources_config.json");
}

/* ------------------------------------------------------------------ */
/* Frontmatter format                                                  */
/* ------------------------------------------------------------------ */

type FrontmatterShape = BriefEditionMeta & {
  /** Per-item structured metadata, keyed by item_id. */
  items: Record<string, BriefItemMeta>;
};

const FENCE = "---";

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

const SECTION_HEADERS = {
  what_happened: "What happened",
  why_it_matters: "Why it matters to UC",
  for_the_committee: "For the committee",
} as const;

export function serializeEdition(edition: BriefEdition): string {
  const items: Record<string, BriefItemMeta> = {};
  for (const item of edition.items) {
    items[item.item_id] = {
      priority: item.priority,
      feed_sources: item.feed_sources,
      baseline_anchors: item.baseline_anchors,
      peer_anchors: item.peer_anchors,
      experts: item.experts,
    };
  }
  const fm: FrontmatterShape = {
    edition_id: edition.edition_id,
    week_ending: edition.week_ending,
    status: edition.status,
    reviewed_by: edition.reviewed_by,
    reviewed_at: edition.reviewed_at,
    generated_at: edition.generated_at,
    generated_by_model: edition.generated_by_model,
    inputs_manifest: edition.inputs_manifest,
    items,
  };

  const bodyParts: string[] = [];
  for (const item of edition.items) {
    bodyParts.push(`## ${item.item_id} — ${item.headline}`);
    bodyParts.push("");
    bodyParts.push(`### ${SECTION_HEADERS.what_happened}`);
    bodyParts.push(item.what_happened.trim());
    bodyParts.push("");
    bodyParts.push(`### ${SECTION_HEADERS.why_it_matters}`);
    bodyParts.push(item.why_it_matters.trim());
    bodyParts.push("");
    bodyParts.push(`### ${SECTION_HEADERS.for_the_committee}`);
    bodyParts.push(item.for_the_committee.trim());
    bodyParts.push("");
  }

  const fmText = JSON.stringify(fm, null, 2);
  return `${FENCE}\n${fmText}\n${FENCE}\n\n${bodyParts.join("\n")}`;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export class BriefParseError extends Error {}

function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  if (!text.startsWith(FENCE)) {
    throw new BriefParseError("Edition file must start with `---` frontmatter fence");
  }
  // After the opening fence, the JSON block begins on the next line.
  const afterOpen = text.indexOf("\n", FENCE.length);
  if (afterOpen === -1) {
    throw new BriefParseError("Edition file is truncated after opening fence");
  }
  const closeIdx = text.indexOf(`\n${FENCE}`, afterOpen);
  if (closeIdx === -1) {
    throw new BriefParseError("Missing closing `---` fence in edition file");
  }
  const frontmatter = text.slice(afterOpen + 1, closeIdx).trim();
  // Skip the closing fence line + any single trailing newline.
  let bodyStart = closeIdx + 1 + FENCE.length;
  while (text[bodyStart] === "\n" || text[bodyStart] === "\r") bodyStart += 1;
  const body = text.slice(bodyStart);
  return { frontmatter, body };
}

type ItemSections = {
  headline: string;
  what_happened: string;
  why_it_matters: string;
  for_the_committee: string;
};

function parseItemSections(body: string): Map<string, ItemSections> {
  const items = new Map<string, ItemSections>();
  // Split on lines starting with "## " (item heading). The first chunk
  // before any "## " is content above the first item and is ignored.
  const lines = body.split("\n");
  let cur: { id: string; sections: ItemSections } | null = null;
  let currentSection: keyof Omit<ItemSections, "headline"> | null = null;

  const flushSection = (text: string) => {
    if (cur && currentSection) {
      cur.sections[currentSection] = text.trim();
    }
  };

  let buf: string[] = [];

  for (const line of lines) {
    const itemMatch = /^##\s+([A-Za-z0-9_-]+)\s+—\s+(.+)$/.exec(line);
    if (itemMatch) {
      flushSection(buf.join("\n"));
      buf = [];
      currentSection = null;
      if (cur) items.set(cur.id, cur.sections);
      cur = {
        id: itemMatch[1],
        sections: {
          headline: itemMatch[2].trim(),
          what_happened: "",
          why_it_matters: "",
          for_the_committee: "",
        },
      };
      continue;
    }
    const sectionMatch = /^###\s+(.+)$/.exec(line);
    if (sectionMatch && cur) {
      flushSection(buf.join("\n"));
      buf = [];
      const heading = sectionMatch[1].trim();
      if (heading === SECTION_HEADERS.what_happened) {
        currentSection = "what_happened";
      } else if (heading === SECTION_HEADERS.why_it_matters) {
        currentSection = "why_it_matters";
      } else if (heading === SECTION_HEADERS.for_the_committee) {
        currentSection = "for_the_committee";
      } else {
        currentSection = null;
      }
      continue;
    }
    if (currentSection) buf.push(line);
  }
  flushSection(buf.join("\n"));
  if (cur) items.set(cur.id, cur.sections);

  return items;
}

export function parseEdition(text: string): BriefEdition {
  const { frontmatter, body } = splitFrontmatter(text);
  let fm: FrontmatterShape;
  try {
    fm = JSON.parse(frontmatter) as FrontmatterShape;
  } catch (err) {
    throw new BriefParseError(
      `Frontmatter JSON parse failed: ${(err as Error).message}`,
    );
  }
  const sections = parseItemSections(body);

  // Items are ordered by their appearance in the body, not by the
  // frontmatter object key order, so the reviewer can reorder by
  // moving body sections around.
  const items: BriefItem[] = [];
  for (const [item_id, prose] of sections) {
    const meta = fm.items[item_id];
    if (!meta) {
      throw new BriefParseError(
        `Item "${item_id}" appears in body but is missing from frontmatter.items`,
      );
    }
    items.push({
      item_id,
      ...meta,
      ...prose,
    });
  }

  return {
    edition_id: fm.edition_id,
    week_ending: fm.week_ending,
    status: fm.status,
    reviewed_by: fm.reviewed_by ?? "",
    reviewed_at: fm.reviewed_at ?? "",
    generated_at: fm.generated_at,
    generated_by_model: fm.generated_by_model,
    inputs_manifest: fm.inputs_manifest,
    items,
  };
}

/* ------------------------------------------------------------------ */
/* I/O                                                                 */
/* ------------------------------------------------------------------ */

export function writeEdition(repoRoot: string, edition: BriefEdition): string {
  const p = editionPath(repoRoot, edition.edition_id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, serializeEdition(edition), "utf-8");
  return p;
}

export function readEdition(repoRoot: string, editionId: string): BriefEdition | null {
  const p = editionPath(repoRoot, editionId);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");
  return parseEdition(raw);
}

export function listEditionIds(repoRoot: string): string[] {
  const dir = editionsDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.endsWith(".rejected.json"))
    .map((f) => f.slice(0, -".md".length))
    .sort();
}

export function listEditions(repoRoot: string): BriefEdition[] {
  const ids = listEditionIds(repoRoot);
  const out: BriefEdition[] = [];
  for (const id of ids) {
    try {
      const ed = readEdition(repoRoot, id);
      if (ed) out.push(ed);
    } catch (err) {
      console.warn(`[brief] failed to parse edition ${id}: ${(err as Error).message}`);
    }
  }
  return out;
}

export function listPublishedEditions(repoRoot: string): BriefEdition[] {
  return listEditions(repoRoot).filter((e) => e.status === "published");
}

/**
 * The single most recent published edition — the one the public Brief tab
 * surfaces as its main content. Editions are sorted by edition_id (which is
 * ISO week ordered, e.g. 2026-W23), so the last one is the newest. Returns
 * null when nothing has been published yet. Drafts are never returned: only
 * editions a reviewer has explicitly published reach the public page.
 */
export function readLatestEdition(repoRoot: string): BriefEdition | null {
  const published = listPublishedEditions(repoRoot);
  if (published.length === 0) return null;
  published.sort((a, b) => a.edition_id.localeCompare(b.edition_id));
  return published[published.length - 1];
}

/**
 * Items rejected by the validator. Kept as a JSON sidecar so the
 * generation pipeline's "tried and rejected" record is auditable in
 * git, but never displayed in the public Brief.
 */
export type RejectedRecord = {
  edition_id: string;
  rejected_at: string;
  items: Array<{
    headline: string;
    reasons: string[];
    raw: unknown;
  }>;
};

export function writeRejected(
  repoRoot: string,
  editionId: string,
  record: RejectedRecord,
): string {
  const p = rejectedPath(repoRoot, editionId);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(record, null, 2) + "\n", "utf-8");
  return p;
}
