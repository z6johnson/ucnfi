/**
 * Tier-2 collector: direct Anthropic API with the server-side
 * web_search tool enabled. Catches op-eds, podcasts, interviews, and
 * press quotes that don't appear in any structured feed.
 *
 * Uses the 20260209 web_search tool revision and forces tool use
 * (`tool_choice: { type: "any" }`) so the model can't short-circuit to
 * an empty answer without searching. The lookback window is parameterised
 * via `WebSearchOptions.lookbackDays` so the same code drives both the
 * normal 7-day daily run and one-shot wider backfills.
 *
 * The model is asked for strict JSON in its final text block so we can
 * parse without paying tokens for prose.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  type ActivityItem,
  type ActivitySourceKind,
  itemId,
  isoNowUTC,
} from "../activity.ts";
import { type CommitteeMember } from "../committee.ts";

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

const SCAN_MODEL = process.env.SCAN_MODEL || "claude-opus-4-6";
const MAX_TOOL_USES = 5;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set; tier-2 web search requires it.");
  }
  client = new Anthropic({ apiKey });
  return client;
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(lookbackDays: number): string {
  return `You scan public web sources for recent AI-related output by one named member of the UC Next Frontier Initiative (UCNFI) Steering Committee. You MUST call the web_search tool at least once before answering.

Look for items from the past ${lookbackDays} day(s) only.

Be permissive about what counts as a hit:
  (a) the named person is the author, interviewee, quoted source, panel/keynote speaker, or named lead — not just mentioned in passing, AND
  (b) the item touches AI in any substantive way: artificial intelligence, machine learning, AI governance/policy/safety/ethics, AI literacy, foundation models, LLMs, AI infrastructure, applied AI in health/research/education, or the member commenting on the field.

Include items where the AI angle is secondary — the digest layer will filter further. When in doubt, include and explain in match_reason.

Skip stock-image bios, conference attendee lists, items where the member is named but not the subject, and anything older than ${lookbackDays} days.

Source kinds (use exactly one of these strings): publication, op_ed, podcast, interview, press_quote, position_statement, blog_post, talk, other.

Your final assistant message MUST be a single JSON object and nothing else, with this shape:

{
  "items": [
    {
      "title": "...",
      "url": "https://...",
      "published_at": "2026-05-04" or null,
      "snippet": "first ~300 chars of context, plain text",
      "source_kind": "op_ed",
      "match_reason": "one short sentence: why this is the named member, not someone else"
    }
  ]
}

If your searches genuinely found nothing in the window, return {"items": []}. Do not include explanatory prose. Do not wrap the JSON in code fences.`;
}

function buildUserPrompt(member: CommitteeMember, aliases: string[], lookbackDays: number): string {
  const aliasLine = aliases.length > 0 ? `Also try aliases: ${aliases.map((a) => `"${a}"`).join(", ")}.` : "";
  return `Member: "${member.name.full}".
Primary affiliation: ${member.primary_affiliation.title}, ${member.primary_affiliation.organization}.
${aliasLine}

Search the public web for AI-related output by this person published in the last ${lookbackDays} day(s). Run at least one web_search call before answering. Return strict JSON per the system instructions.`;
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                    */
/* ------------------------------------------------------------------ */

const VALID_SOURCE_KINDS = new Set([
  "publication",
  "op_ed",
  "podcast",
  "interview",
  "press_quote",
  "position_statement",
  "blog_post",
  "talk",
  "other",
]);

type RawWebItem = {
  title?: unknown;
  url?: unknown;
  published_at?: unknown;
  snippet?: unknown;
  source_kind?: unknown;
  match_reason?: unknown;
};

function extractFinalText(message: Anthropic.Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n").trim();
}

function tryParseJsonBlock(text: string): { items?: RawWebItem[] } | null {
  // Strip an accidental code fence if the model produced one despite instructions.
  let s = text.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) s = fenceMatch[1].trim();
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object") return v as { items?: RawWebItem[] };
  } catch {
    // Fall through.
  }
  // Last resort: find the first { ... } substring and try.
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const v = JSON.parse(s.slice(start, end + 1));
      if (v && typeof v === "object") return v as { items?: RawWebItem[] };
    } catch {
      // Give up.
    }
  }
  return null;
}

function normaliseItem(memberId: string, raw: RawWebItem): ActivityItem | null {
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 300) : "";
  if (!title) return null;
  const sourceKindRaw = typeof raw.source_kind === "string" ? raw.source_kind : "other";
  const sourceKind: ActivitySourceKind = "websearch"; // tier-2 always tagged websearch at the activity level
  const match = typeof raw.match_reason === "string" ? raw.match_reason.slice(0, 240) : "";
  const matchReason = `websearch (${VALID_SOURCE_KINDS.has(sourceKindRaw) ? sourceKindRaw : "other"})${match ? ` — ${match}` : ""}`;
  const snippet = typeof raw.snippet === "string" ? raw.snippet.slice(0, 400) : "";
  let publishedAt: string | null = null;
  if (typeof raw.published_at === "string" && raw.published_at) {
    const t = Date.parse(raw.published_at);
    if (Number.isFinite(t)) publishedAt = new Date(t).toISOString();
  }
  return {
    id: itemId(url),
    member_id: memberId,
    tier: 2,
    source_kind: sourceKind,
    title,
    url,
    published_at: publishedAt,
    snippet,
    match_reason: matchReason,
    discovered_at: isoNowUTC(),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type WebSearchOptions = {
  searchAliases?: string[];
  /** Cap the number of tool calls Claude can make. Default 5. */
  maxToolUses?: number;
  /** Lookback window passed into the system + user prompts. Default 7. */
  lookbackDays?: number;
};

const DEFAULT_LOOKBACK_DAYS = 7;

export async function collectTier2(
  member: CommitteeMember,
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const maxUses = opts.maxToolUses ?? MAX_TOOL_USES;
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: SCAN_MODEL,
      max_tokens: 2048,
      system: buildSystemPrompt(lookbackDays),
      messages: [{ role: "user", content: buildUserPrompt(member, aliases, lookbackDays) }],
      // Force the model to emit at least one tool call. With `auto`, the
      // model could shortcut to {"items": []} without searching at all,
      // which is what we observed in the 2026-05-05 wet run.
      tool_choice: { type: "any" },
      // Cast to bypass SDK literal type narrowing for the server-side
      // web_search tool. Use the newer 20260209 version of the tool.
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: maxUses,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
  } catch (err) {
    console.warn(
      `[scan] tier-2 messages.create failed member=${member.member_id} err=${(err as Error).message}`,
    );
    return [];
  }

  // Diagnostic: count content-block types and the actual web_search
  // request count from usage. If `web_search_requests` is 0, the model
  // never called the tool; if it's > 0 but items come back empty, the
  // search ran and genuinely found nothing or our prompt is dropping
  // results.
  const blockCounts: Record<string, number> = {};
  for (const block of message.content) {
    blockCounts[block.type] = (blockCounts[block.type] ?? 0) + 1;
  }
  const blockSummary = Object.entries(blockCounts)
    .map(([t, n]) => `${t}=${n}`)
    .join(",");
  const searchCount = message.usage?.server_tool_use?.web_search_requests ?? 0;
  console.info(
    `[scan] tier-2 ${member.member_id} searches=${searchCount} blocks=[${blockSummary}] stop=${message.stop_reason ?? "?"}`,
  );

  const text = extractFinalText(message);
  if (!text) {
    console.warn(`[scan] tier-2 empty response member=${member.member_id}`);
    return [];
  }
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    console.warn(`[scan] tier-2 unparseable response member=${member.member_id}: ${text.slice(0, 200)}`);
    return [];
  }
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: ActivityItem[] = [];
  for (const r of rawItems) {
    const norm = normaliseItem(member.member_id, r);
    if (norm) items.push(norm);
  }
  return items;
}
