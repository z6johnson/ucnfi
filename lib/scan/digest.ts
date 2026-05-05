/**
 * Weekly digest builder.
 *
 * Reads the last 7 days of activity items, calls the Anthropic API
 * directly with prompt caching on the unchanging committee block, and
 * produces a markdown digest grouped by topic and mapped to OA-1..OA-8.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  type ActivityItem,
  isoWeekLabel,
  lastNDates,
  readItemsForDates,
} from "../activity.ts";
import { committeeContextSummary, listMembers } from "../committee.ts";

const DIGEST_MODEL = process.env.DIGEST_MODEL || "claude-opus-4-6";
const DIGEST_MAX_TOKENS = 4096;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set; the weekly digest requires the direct Anthropic API.");
  }
  client = new Anthropic({ apiKey });
  return client;
}

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */

const FRAMING = `You are writing a weekly digest of UCNFI Steering Committee public AI activity for the committee co-chairs and program staff.

Strict rules:

1. Only reference members and items that appear in the COMMITTEE DIRECTORY and the WEEKLY ITEMS list below. Never invent a member, item, URL, or quote.
2. Cite every member reference inline as [member_id] (lowercase last name, hyphen, first initial — e.g., [neely-r], [khosla-p]). Never bracket OA codes (write OA-1, not [OA-1]).
3. The COMMITTEE DIRECTORY is the source of truth for who counts as a member; if an item names someone not in it, ignore that item.
4. Plain language. Person-to-person register. No marketing language. Lead with the implication.
5. If the items don't support a claim, don't make the claim. "The week's items don't cover this" is fine.

Output structure (markdown, no code fences around prose):

# Week <ISO_WEEK_LABEL> — UCNFI committee AI activity

_<one-sentence framing of the week — volume and shape, not editorial>_

## By topic

For each topic that has items this week, a level-3 heading and a bulleted list. Topics in this order; skip any with zero items:

- Publications (papers, preprints) — \`source_kind=publication\` or \`source_kind=arxiv\`
- Op-eds & positions — \`source_kind=op_ed, position_statement\`
- Podcasts & interviews — \`source_kind=podcast, interview\`
- Press quotes — \`source_kind=press_quote\`
- Talks & blog posts — \`source_kind=talk, blog_post, rss\`
- Other

Each bullet: \`[member_id] "Title" — outlet/site, YYYY-MM-DD — OA-X[, OA-Y]\` followed by a one-line summary. Map each item to one or two Opportunity Areas based on the COMMITTEE DIRECTORY's existing OA mappings for that member; if the item is clearly outside their declared OAs, write "(off-OA)" instead of guessing.

## By member

Compact list, only members with at least one item this week, sorted by item count descending. Format: \`[member_id] — N items: <topic counts>\`.

## Flag for the next meeting

3–6 bullets. Items worth a co-chair's attention: a position taken, a high-profile venue, an item that contradicts or complicates the committee's stated direction, a new public stance that should be reconciled into the member's record on the next enrichment pass. If nothing this week warrants a flag, write a single bullet: "Nothing flagged this week."`;

function committeeBlock(): string {
  return `## COMMITTEE DIRECTORY (UCNFI Steering Committee)

The 23-member directory below is the authoritative source for who is on the committee. Each member appears with their member_id in [brackets], primary affiliation, and OA mappings.

${committeeContextSummary()}`;
}

function itemsBlock(items: ActivityItem[], isoWeek: string, dates: string[]): string {
  // Group items by member for readability; the model reads better that way.
  const byMember = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const arr = byMember.get(item.member_id) ?? [];
    arr.push(item);
    byMember.set(item.member_id, arr);
  }
  const lines: string[] = [];
  lines.push(`## WEEKLY ITEMS — week ${isoWeek}, dates ${dates[0]} through ${dates[dates.length - 1]}`);
  lines.push("");
  if (byMember.size === 0) {
    lines.push("(no items collected this week)");
    return lines.join("\n");
  }
  for (const [memberId, memberItems] of byMember) {
    lines.push(`### [${memberId}] — ${memberItems.length} item(s)`);
    for (const it of memberItems) {
      lines.push(
        `- tier=${it.tier} kind=${it.source_kind} published=${it.published_at ?? "unknown"}`,
      );
      lines.push(`  title: ${it.title}`);
      lines.push(`  url: ${it.url}`);
      if (it.snippet) lines.push(`  snippet: ${it.snippet}`);
      if (it.match_reason) lines.push(`  match: ${it.match_reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type DigestResult = {
  isoWeek: string;
  dates: string[];
  itemCount: number;
  markdown: string;
};

export async function buildWeeklyDigest(
  repoRoot: string,
  endDate: Date = new Date(),
): Promise<DigestResult> {
  const dates = lastNDates(7, endDate);
  const items = readItemsForDates(repoRoot, dates);
  const isoWeek = isoWeekLabel(endDate);

  // Filter out items for member_ids that don't actually exist in the
  // directory — protects against stale ids in the activity log.
  const knownIds = new Set(listMembers().map((m) => m.member_id));
  const filtered = items.filter((i) => knownIds.has(i.member_id));

  // Short-circuit: if no items, return a stub digest without an API
  // call. No reason to spend tokens to say "nothing happened".
  if (filtered.length === 0) {
    const md = `# Week ${isoWeek} — UCNFI committee AI activity\n\n_No qualifying items collected for ${dates[0]} through ${dates[dates.length - 1]}._\n\n## Flag for the next meeting\n\n- Nothing flagged this week.\n`;
    return { isoWeek, dates, itemCount: 0, markdown: md };
  }

  const userPrompt = itemsBlock(filtered, isoWeek, dates);

  const message = await getClient().messages.create({
    model: DIGEST_MODEL,
    max_tokens: DIGEST_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: FRAMING.replace("<ISO_WEEK_LABEL>", isoWeek),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: committeeBlock(),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  let markdown = "";
  for (const block of message.content) {
    if (block.type === "text") markdown += block.text;
  }
  markdown = markdown.trim() + "\n";
  return { isoWeek, dates, itemCount: filtered.length, markdown };
}
