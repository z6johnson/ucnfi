/**
 * Tier-2 collector: LiteLLM (TritonAI) chat with the Anthropic
 * web-search tool enabled. Catches op-eds, podcasts, interviews, and
 * press quotes that don't appear in any structured feed.
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

const LITELLM_BASE_URL =
  process.env.LITELLM_BASE_URL ?? "https://tritonai-api.ucsd.edu";
const SCAN_MODEL = process.env.SCAN_MODEL ?? process.env.CLAUDE_MODEL ?? "claude-opus-4-6";
const MAX_TOOL_USES = 5;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const authToken = process.env.LITELLM_API_KEY;
  if (!authToken) {
    throw new Error("LITELLM_API_KEY is not set; tier-2 web search requires it.");
  }
  client = new Anthropic({
    authToken,
    baseURL: LITELLM_BASE_URL,
    apiKey: null,
  });
  return client;
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You scan public web sources for recent AI-related output by one named member of the UC Next Frontier Initiative (UCNFI) Steering Committee. Use the web_search tool to look for items from the past 7 days only.

Count an item as a hit only if it is BOTH:
  (a) clearly attributable to the named member (author, interviewee, quoted source, or session lead — not just mentioned in passing), and
  (b) substantively about AI: artificial intelligence, machine learning, AI governance/policy/safety/ethics, AI literacy, foundation models, LLMs, AI infrastructure, applied AI in health/research/education, etc.

Skip stock-image bios, conference attendee lists, and items where the member is named but not the subject.

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

If no qualifying items are found, return {"items": []}. Do not include explanatory prose. Do not wrap the JSON in code fences.`;

function buildUserPrompt(member: CommitteeMember, aliases: string[]): string {
  const aliasLine = aliases.length > 0 ? `Also try aliases: ${aliases.map((a) => `"${a}"`).join(", ")}.` : "";
  return `Member: "${member.name.full}".
Primary affiliation: ${member.primary_affiliation.title}, ${member.primary_affiliation.organization}.
${aliasLine}

Search for AI-related output by this person published in the last 7 days. Return strict JSON per the system instructions.`;
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
};

export async function collectTier2(
  member: CommitteeMember,
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const maxUses = opts.maxToolUses ?? MAX_TOOL_USES;

  let message: Anthropic.Message;
  try {
    message = await getClient().messages.create({
      model: SCAN_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(member, aliases) }],
      // Cast to bypass SDK literal type narrowing — LiteLLM passes the
      // tool through to upstream Anthropic verbatim.
      tools: [
        {
          type: "web_search_20250305",
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
