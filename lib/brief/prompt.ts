/**
 * System + user prompt assembly for the weekly Brief generator.
 *
 * Three cached system blocks (framing + baseline + peer baseline +
 * committee summary) and one user turn that hands Claude the four
 * collected feed buckets with stable ids it can quote in
 * feed_sources.
 */

import { DIMENSION_IDS } from "../baseline.ts";
import { baselineBlock } from "../claude.ts";
import { committeeContextSummary } from "../committee.ts";
import { peerBaselineBlock } from "../peers.ts";
import type { BriefRawItem } from "./types.ts";

/* ------------------------------------------------------------------ */
/* System framing                                                      */
/* ------------------------------------------------------------------ */

export function briefFramingBlock(): string {
  return `You assemble a weekly Brief for the UC President — three to five items, each anchored to the UC baseline and citable. The Brief is read in two minutes. A reader should know exactly what's on their plate at the end of it.

## Strict structure for every item

Four parts, in order, no exceptions:

1. **headline** — One line. The development, stated plainly. Not a teaser.
2. **what_happened** — Two to three sentences. The development itself with a source link. This is the only part that is pure reporting.
3. **why_it_matters** — Two to three sentences. The synthesis: where UC stands relative to what just happened. Anchored to the baseline. Not "this is important" but "UC has no systemwide position on X and three campuses have conflicting local ones."
4. **for_the_committee** — One line. A recommended question or a framed choice. Not an answer.

## Non-negotiable rules

1. Every why_it_matters claim about UC MUST be backed by at least one baseline_anchor whose entity_id, dimension, and field exist in the BASELINE DATASET below. If you cannot anchor a claim, drop the claim. If the item has no anchorable claims at all, drop the item.
2. Use the right claim_kind per anchor:
   - "uc_has_position" — the baseline FieldRecord.value is truthy (true or a non-empty string other than "equivocal").
   - "uc_silent" — the baseline FieldRecord.value === false AND source_id === "inventory-gap". UC looked and found nothing.
   - "uc_contradicts" — the baseline FieldRecord.value === "equivocal".
   - "baseline_missing" — the field is not in the baseline at all. Use sparingly; this is honest gap-flagging, not a license to invent.
3. Use peer_anchors against the PEER BASELINE when contrasting with a non-UC institution. Same discipline — never invent a peer_id, dimension, or field.
4. Every what_happened MUST have at least one feed_source. feed_sources reference raw items by their id; quote the id from the WEEKLY INPUTS section. Never invent a URL or title.
5. experts is optional. When set, every member_id must appear in the COMMITTEE DIRECTORY.
6. If an item only restates a development with no UC-relative consequence the baseline can speak to, DROP IT. An empty Brief is better than a padded one. The target is three to five items; if only two clear the bar, return two.
7. Headlines are plain, not teasers. for_the_committee is a framed question or choice, never an answer.
8. AI-assembled, human-accountable. A human reviewer reads what you produce before it reaches the President. Be precise; do not paraphrase the baseline imprecisely.
9. Timeliness is mandatory. The WEEKLY INPUTS header states the window. Every item must describe a development from within it. A source's published date is shown on each input line — if it predates the window (or is older than what a re-surfaced item should be), DROP the item. The Brief surfaces what is on the President's plate now, not stale news. When in doubt about freshness, drop it.

## Output format

Return a single JSON object and nothing else. No prose. No code fences.

\`\`\`
{
  "items": [
    {
      "item_id": "item-1",
      "priority": 1,
      "headline": "...",
      "what_happened": "...",
      "why_it_matters": "...",
      "for_the_committee": "...",
      "feed_sources": [
        { "kind": "external", "subkind": "ed_ocr", "url": "...", "title": "...", "published_at": "2026-05-21" }
      ],
      "baseline_anchors": [
        { "entity_id": "ucop_systemwide", "dimension": "policy", "field": "has_genai_policy", "claim_kind": "uc_silent" }
      ],
      "peer_anchors": [],
      "experts": [
        { "member_id": "neely-r", "why": "Financial aid systems lead" }
      ]
    }
  ]
}
\`\`\`

priority maps to the feed bucket the item came from:
  1 = external developments (Federal Register, ED, CA Legislature, courts, peer-system moves) AND live web-search findings
  2 = peer institution moves
  3 = vendor & capability shifts
  4 = committee signal (from the activity scan)

Items from the WEB SEARCH section are cited as external feed_sources with subkind "web_search":
{ "kind": "external", "subkind": "web_search", "url": "...", "title": "...", "published_at": "..." }
Quote the url exactly as it appears in the WEEKLY INPUTS line — do not reword or strip it.

item_id is "item-N" where N is the item's position (1-based). Use it consistently across feed_sources references if needed.

For committee_signal feed_sources, include the activity_item_id and member_id from the WEEKLY INPUTS list, e.g.:
{ "kind": "committee_signal", "activity_item_id": "abc123...", "member_id": "neely-r", "url": "...", "title": "...", "published_at": "2026-05-23" }

For peer feed_sources:
{ "kind": "peer", "peer_id": "umich", "url": "...", "title": "...", "published_at": "..." }

For vendor feed_sources:
{ "kind": "vendor", "subkind": "vendor_anthropic", "url": "...", "title": "...", "published_at": "..." }

The 10 baseline dimensions are: ${DIMENSION_IDS.join(", ")}.`;
}

/* ------------------------------------------------------------------ */
/* User turn — the four feed buckets                                   */
/* ------------------------------------------------------------------ */

function formatItem(item: BriefRawItem): string[] {
  const lines: string[] = [];
  const date = item.published_at ?? "unknown";
  lines.push(`- [${item.id}] kind=${item.feed_kind} subkind=${item.subkind} published=${date}`);
  if (item.member_id) lines.push(`  member_id: ${item.member_id}`);
  if (item.peer_id) lines.push(`  peer_id: ${item.peer_id}`);
  lines.push(`  title: ${item.title}`);
  lines.push(`  url: ${item.url}`);
  if (item.snippet) lines.push(`  snippet: ${item.snippet}`);
  if (item.match_reason) lines.push(`  match: ${item.match_reason}`);
  return lines;
}

export function userInputsBlock(args: {
  isoWeek: string;
  windowFrom: string;
  windowTo: string;
  external: BriefRawItem[];
  peer: BriefRawItem[];
  vendor: BriefRawItem[];
  web: BriefRawItem[];
  committee: BriefRawItem[];
}): string {
  const lines: string[] = [];
  lines.push(`## WEEKLY INPUTS — ${args.isoWeek} (${args.windowFrom} through ${args.windowTo})`);
  lines.push("");

  const sections: Array<[string, BriefRawItem[]]> = [
    ["EXTERNAL DEVELOPMENTS (priority 1)", args.external],
    ["WEB SEARCH — RECENT AI DEVELOPMENTS (priority 1)", args.web],
    ["PEER INSTITUTION MOVES (priority 2)", args.peer],
    ["VENDOR & CAPABILITY SHIFTS (priority 3)", args.vendor],
    ["COMMITTEE SIGNAL (priority 4)", args.committee],
  ];

  for (const [label, items] of sections) {
    lines.push(`### ${label} — ${items.length} item(s)`);
    if (items.length === 0) {
      lines.push("(no items collected this week)");
    } else {
      for (const item of items) {
        for (const l of formatItem(item)) lines.push(l);
      }
    }
    lines.push("");
  }

  lines.push(`The window ${args.windowFrom} through ${args.windowTo} is authoritative for timeliness — drop any item whose source predates it.`);
  lines.push("Assemble the Brief now. Three to five items. JSON object only. Drop items that cannot be anchored to the baseline.");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* System block factories — re-exported for the generator              */
/* ------------------------------------------------------------------ */

export { baselineBlock, peerBaselineBlock, committeeContextSummary };
