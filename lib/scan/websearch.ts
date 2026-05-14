/**
 * Tier-2 collector: UCSD TritonAI LiteLLM proxy with the server-side
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

import type Anthropic from "@anthropic-ai/sdk";

import {
  type ActivityItem,
  type ActivityScope,
  type ActivitySourceKind,
  COMMITTEE_SCOPE_ID,
  itemId,
  isoNowUTC,
} from "../activity.ts";
import { getLiteLLMClient } from "../claude.ts";
import { type CommitteeMember } from "../committee.ts";

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

const SCAN_MODEL = process.env.SCAN_MODEL || "claude-opus-4-6";
const MAX_TOOL_USES = 5;

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

function buildCommitteeSystemPrompt(lookbackDays: number): string {
  return `You scan public web sources for recent mentions of the UC Next Frontier Initiative (UCNFI) Steering Committee — also called the UC AI Steering Committee — as a body. You MUST call the web_search tool at least once before answering.

Look for items from the past ${lookbackDays} day(s) only.

A hit is an item that:
  (a) names the committee, initiative, or its formal launch / charge / membership / output as a body — NOT just an individual member doing their own work, AND
  (b) is published in a credible venue: UC newsroom or campus communications, UCOP press, mainstream press, trade press (Inside Higher Ed, Chronicle of Higher Education, EdSurge), policy outlets, or official UC system pages.

Examples of hits:
  - press coverage announcing or describing the committee
  - UC Newsroom / campus comms about the committee
  - the committee's own published statements, charters, charges, working group outputs
  - quotes from committee co-chairs (Khosla, Williams, Palazoglu) speaking AS committee leadership about the committee's work
  - mentions of the initiative in legislative or regulatory contexts

Do NOT include:
  - work by an individual committee member that doesn't reference the committee itself
  - older items predating the committee's formation
  - aggregator pages, member directories, or CV listings

Source kinds (use exactly one of these strings): press_release, news_article, op_ed, position_statement, blog_post, podcast, talk, other.

Your final assistant message MUST be a single JSON object and nothing else, with this shape:

{
  "items": [
    {
      "title": "...",
      "url": "https://...",
      "published_at": "2026-05-04" or null,
      "snippet": "first ~300 chars of context, plain text",
      "source_kind": "news_article",
      "match_reason": "one short sentence: why this is about the committee as a body, not an individual member"
    }
  ]
}

If your searches genuinely found nothing in the window, return {"items": []}. Do not include explanatory prose. Do not wrap the JSON in code fences.`;
}

function buildCommitteeUserPrompt(aliases: string[], lookbackDays: number): string {
  const aliasLine = aliases.length > 0
    ? `Search for these names: ${aliases.map((a) => `"${a}"`).join(", ")}.`
    : "";
  return `Subject: the UCNFI Steering Committee (the UC AI Steering Committee, UC Next Frontier Initiative).
${aliasLine}

Search the public web for items about this committee as a body, published in the last ${lookbackDays} day(s). Run at least one web_search call before answering. Return strict JSON per the system instructions.`;
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                    */
/* ------------------------------------------------------------------ */

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

function normaliseItem(
  memberId: string,
  raw: RawWebItem,
  scope: ActivityScope = "member",
): ActivityItem | null {
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 300) : "";
  if (!title) return null;
  const sourceKindRaw = typeof raw.source_kind === "string" ? raw.source_kind : "other";
  const sourceKind: ActivitySourceKind = "websearch"; // tier-2 always tagged websearch at the activity level
  const match = typeof raw.match_reason === "string" ? raw.match_reason.slice(0, 240) : "";
  const matchReason = `websearch (${sourceKindRaw})${match ? ` — ${match}` : ""}`;
  const snippet = typeof raw.snippet === "string" ? raw.snippet.slice(0, 400) : "";
  let publishedAt: string | null = null;
  if (typeof raw.published_at === "string" && raw.published_at) {
    const t = Date.parse(raw.published_at);
    if (Number.isFinite(t)) publishedAt = new Date(t).toISOString();
  }
  return {
    id: itemId(url),
    member_id: memberId,
    scope,
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

async function runWebSearch(args: {
  systemPrompt: string;
  userPrompt: string;
  maxUses: number;
  logTag: string;
}): Promise<Anthropic.Message | null> {
  try {
    return await getLiteLLMClient().messages.create({
      model: SCAN_MODEL,
      max_tokens: 2048,
      system: args.systemPrompt,
      messages: [{ role: "user", content: args.userPrompt }],
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
          max_uses: args.maxUses,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
  } catch (err) {
    console.warn(
      `[scan] tier-2 messages.create failed ${args.logTag} err=${(err as Error).message}`,
    );
    return null;
  }
}

function logSearchDiagnostics(message: Anthropic.Message, logTag: string): void {
  const blockCounts: Record<string, number> = {};
  for (const block of message.content) {
    blockCounts[block.type] = (blockCounts[block.type] ?? 0) + 1;
  }
  const blockSummary = Object.entries(blockCounts)
    .map(([t, n]) => `${t}=${n}`)
    .join(",");
  const searchCount = message.usage?.server_tool_use?.web_search_requests ?? 0;
  console.info(
    `[scan] tier-2 ${logTag} searches=${searchCount} blocks=[${blockSummary}] stop=${message.stop_reason ?? "?"}`,
  );
}

function parseSearchItems(
  message: Anthropic.Message,
  logTag: string,
): RawWebItem[] {
  const text = extractFinalText(message);
  if (!text) {
    console.warn(`[scan] tier-2 empty response ${logTag}`);
    return [];
  }
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    console.warn(`[scan] tier-2 unparseable response ${logTag}: ${text.slice(0, 200)}`);
    return [];
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export async function collectTier2(
  member: CommitteeMember,
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const maxUses = opts.maxToolUses ?? MAX_TOOL_USES;
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const logTag = member.member_id;

  const message = await runWebSearch({
    systemPrompt: buildSystemPrompt(lookbackDays),
    userPrompt: buildUserPrompt(member, aliases, lookbackDays),
    maxUses,
    logTag,
  });
  if (!message) return [];
  logSearchDiagnostics(message, logTag);

  const items: ActivityItem[] = [];
  for (const r of parseSearchItems(message, logTag)) {
    const norm = normaliseItem(member.member_id, r, "member");
    if (norm) items.push(norm);
  }
  return items;
}

/**
 * Tier-2 collector for the steering committee as a body. Mirrors
 * `collectTier2` but uses a committee-focused prompt and stamps items
 * with `scope: "committee"` and `member_id: COMMITTEE_SCOPE_ID`.
 */
export async function collectTier2Committee(
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const maxUses = opts.maxToolUses ?? MAX_TOOL_USES;
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const logTag = COMMITTEE_SCOPE_ID;

  const message = await runWebSearch({
    systemPrompt: buildCommitteeSystemPrompt(lookbackDays),
    userPrompt: buildCommitteeUserPrompt(aliases, lookbackDays),
    maxUses,
    logTag,
  });
  if (!message) return [];
  logSearchDiagnostics(message, logTag);

  const items: ActivityItem[] = [];
  for (const r of parseSearchItems(message, logTag)) {
    const norm = normaliseItem(COMMITTEE_SCOPE_ID, r, "committee");
    if (norm) items.push(norm);
  }
  return items;
}
