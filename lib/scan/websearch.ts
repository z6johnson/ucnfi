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
import { getLiteLLMClient } from "../litellm.ts";
import { type CommitteeMember } from "../committee.ts";

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

const SCAN_MODEL = process.env.SCAN_MODEL || "claude-sonnet-4-6";
// Raised from 5 to give the model room for the extra platform-scoped
// searches (mainstream press + each social platform) without starving
// press coverage of tool budget.
const MAX_TOOL_USES = 8;

/* ------------------------------------------------------------------ */
/* Date enforcement                                                    */
/* ------------------------------------------------------------------ */

/** One day of slack on the cutoff so timezone/boundary rounding doesn't
 *  drop an item published right at the edge of the window. */
const WINDOW_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Server-side guard for the lookback window. The prompt asks the model to
 * stay within `lookbackDays`, but it reliably ignores that and returns
 * well-known older hits, so we enforce it here.
 *
 * Returns true (keep) when:
 *   - there is no usable published date — the model emits `null` for
 *     undatable posts, and dropping those would throw away fresh-but-undated
 *     social content; or
 *   - the published date is within `lookbackDays` of now (plus a day of grace).
 * Returns false (drop) only for an item carrying a parseable date that is
 * clearly older than the window — exactly the stale 2025 press hits.
 */
export function isWithinPublishedWindow(
  publishedAtIso: string | null,
  lookbackDays: number,
  now: number = Date.now(),
): boolean {
  if (!publishedAtIso) return true;
  const t = Date.parse(publishedAtIso);
  if (!Number.isFinite(t)) return true;
  const cutoff = now - lookbackDays * 24 * 60 * 60 * 1000 - WINDOW_GRACE_MS;
  return t >= cutoff;
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(lookbackDays: number): string {
  return `You scan public web sources for recent AI-related output by one named member of the UC Next Frontier Initiative (UCNFI) Steering Committee. You MUST call the web_search tool at least once before answering.

Look for items from the past ${lookbackDays} day(s) only.

Cover BOTH mass media and public social/owned media. Do not stop at news articles — this member's thought leadership also surfaces as:
  - X/Twitter posts and threads
  - LinkedIn posts and articles
  - YouTube talks, lectures, panels, and interview recordings
  - Bluesky, Mastodon, and Threads posts
  - Substack posts and Notes
Run searches against both mainstream press AND these platforms. Site-scoped queries help: e.g. \`site:x.com\`, \`site:linkedin.com/posts\`, \`site:bsky.app\`, \`site:youtube.com\`. Return the canonical post/video URL, not a search or aggregator URL.

Be permissive about what counts as a hit:
  (a) the named person is the author, poster, interviewee, quoted source, panel/keynote speaker, or named lead — not just mentioned in passing, AND
  (b) the item touches AI in any substantive way: artificial intelligence, machine learning, AI governance/policy/safety/ethics, AI literacy, foundation models, LLMs, AI infrastructure, applied AI in health/research/education, or the member commenting on the field.

Include items where the AI angle is secondary — the digest layer will filter further. When in doubt, include and explain in match_reason.

Skip stock-image bios, conference attendee lists, items where the member is named but not the subject, pure reshares/retweets with no added commentary of their own, and anything older than ${lookbackDays} days.

Source kinds (use exactly one of these strings): publication, op_ed, podcast, video, social_post, interview, press_quote, position_statement, blog_post, talk, other. Use \`social_post\` for X/LinkedIn/Bluesky/Mastodon/Threads posts and \`video\` for YouTube and other video talks; keep \`podcast\` for audio.

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

/** Known social/owned-media accounts for a member, when configured. */
export type MemberHandles = {
  x_handle?: string | null;
  linkedin?: string | null;
  bluesky?: string | null;
  youtube?: string | null;
};

function buildHandleLine(handles: MemberHandles): string {
  const parts: string[] = [];
  if (handles.x_handle) parts.push(`X: ${handles.x_handle}`);
  if (handles.linkedin) parts.push(`LinkedIn: ${handles.linkedin}`);
  if (handles.bluesky) parts.push(`Bluesky: ${handles.bluesky}`);
  if (handles.youtube) parts.push(`YouTube: ${handles.youtube}`);
  return parts.length > 0 ? `Known accounts to check directly: ${parts.join("; ")}.` : "";
}

function buildUserPrompt(
  member: CommitteeMember,
  aliases: string[],
  handles: MemberHandles,
  lookbackDays: number,
): string {
  const aliasLine = aliases.length > 0 ? `Also try aliases: ${aliases.map((a) => `"${a}"`).join(", ")}.` : "";
  const handleLine = buildHandleLine(handles);
  return `Member: "${member.name.full}".
Primary affiliation: ${member.primary_affiliation.title}, ${member.primary_affiliation.organization}.
${aliasLine}
${handleLine}

Search the public web — including social platforms — for AI-related output by this person published in the last ${lookbackDays} day(s). Run at least one web_search call before answering. Return strict JSON per the system instructions.`;
}

function buildCommitteeSystemPrompt(lookbackDays: number): string {
  return `You scan public web sources for recent mentions of the UC Next Frontier Initiative (UCNFI) Steering Committee — also called the UC AI Steering Committee — as a body. You MUST call the web_search tool at least once before answering.

Look for items from the past ${lookbackDays} day(s) only.

A hit is an item that:
  (a) names the committee, initiative, or its formal launch / charge / membership / output as a body — NOT just an individual member doing their own work, AND
  (b) is published in a credible venue: UC newsroom or campus communications, UCOP press, mainstream press, trade press (Inside Higher Ed, Chronicle of Higher Education, EdSurge), policy outlets, official UC system pages, OR official/leadership social media (UC and campus accounts, or a co-chair posting AS committee leadership).

Cover BOTH mass media and public social/owned media — check X/Twitter, LinkedIn, YouTube, Bluesky, Mastodon, and Threads as well as press. Site-scoped queries help: e.g. \`site:x.com\`, \`site:linkedin.com/posts\`, \`site:youtube.com\`. Return the canonical post/video URL, not a search or aggregator URL.

Examples of hits:
  - press coverage announcing or describing the committee
  - UC Newsroom / campus comms about the committee
  - the committee's own published statements, charters, charges, working group outputs
  - quotes from or posts by committee co-chairs (Khosla, Williams, Palazoglu) speaking AS committee leadership about the committee's work
  - official UC/initiative social posts or recorded talks about the committee
  - mentions of the initiative in legislative or regulatory contexts

Do NOT include:
  - work by an individual committee member that doesn't reference the committee itself
  - older items predating the committee's formation
  - aggregator pages, member directories, or CV listings

Source kinds (use exactly one of these strings): press_release, news_article, op_ed, position_statement, blog_post, podcast, video, social_post, talk, other. Use \`social_post\` for X/LinkedIn/Bluesky/Mastodon/Threads posts and \`video\` for YouTube and other video talks.

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

Search the public web — including social platforms — for items about this committee as a body, published in the last ${lookbackDays} day(s). Run at least one web_search call before answering. Return strict JSON per the system instructions.`;
}

/* ------------------------------------------------------------------ */
/* Social-only prompts                                                 */
/* ------------------------------------------------------------------ */
/* A dedicated pass scoped to social/owned media. The combined press+social
 * search lets easy press hits eat the tool budget, so social posts rarely
 * surface; this pass searches only the platforms, with its own (wider)
 * window, so sparse social content gets found. */

function buildSocialSystemPrompt(lookbackDays: number): string {
  return `You scan PUBLIC SOCIAL and OWNED MEDIA for recent AI-related output by one named member of the UC Next Frontier Initiative (UCNFI) Steering Committee. You MUST call the web_search tool at least once before answering.

Look for items from the past ${lookbackDays} day(s) only.

Search ONLY social/owned-media platforms — NOT mainstream news sites. Lead with site-scoped queries:
  - \`site:x.com\` — X/Twitter posts and threads
  - \`site:linkedin.com/posts\` and \`site:linkedin.com/pulse\` — LinkedIn posts and articles
  - \`site:bsky.app\` — Bluesky posts
  - \`site:youtube.com\` — talks, lectures, panels, interview recordings
  - Mastodon, Threads, and Substack posts and Notes
Return the canonical post/video URL, not a search or aggregator URL.

A hit is an item where:
  (a) the named person is the author/poster, interviewee, or named speaker — not merely tagged or mentioned in passing, AND
  (b) it touches AI in any substantive way (artificial intelligence, ML, AI governance/policy/safety/ethics, AI literacy, foundation models, LLMs, AI infrastructure, applied AI, or commentary on the field).

Skip pure reshares/retweets with no added commentary of their own, and anything older than ${lookbackDays} days.

Source kinds (use exactly one): use \`social_post\` for X/LinkedIn/Bluesky/Mastodon/Threads/Substack posts and \`video\` for YouTube and other video talks. Do not return mainstream news articles here.

Your final assistant message MUST be a single JSON object and nothing else, with this shape:

{
  "items": [
    {
      "title": "...",
      "url": "https://...",
      "published_at": "2026-05-04" or null,
      "snippet": "first ~300 chars of context, plain text",
      "source_kind": "social_post",
      "match_reason": "one short sentence: why this is the named member, not someone else"
    }
  ]
}

If your searches genuinely found nothing in the window, return {"items": []}. Do not include explanatory prose. Do not wrap the JSON in code fences.`;
}

function buildSocialUserPrompt(
  member: CommitteeMember,
  aliases: string[],
  handles: MemberHandles,
  lookbackDays: number,
): string {
  const aliasLine = aliases.length > 0 ? `Also try aliases: ${aliases.map((a) => `"${a}"`).join(", ")}.` : "";
  const handleLine = buildHandleLine(handles);
  return `Member: "${member.name.full}".
Primary affiliation: ${member.primary_affiliation.title}, ${member.primary_affiliation.organization}.
${aliasLine}
${handleLine}

Search ONLY social/owned-media platforms for AI-related posts/videos by this person published in the last ${lookbackDays} day(s). Prefer the known accounts above when present. Run at least one web_search call before answering. Return strict JSON per the system instructions.`;
}

function buildSocialCommitteeSystemPrompt(lookbackDays: number): string {
  return `You scan PUBLIC SOCIAL and OWNED MEDIA for recent posts/videos about the UC Next Frontier Initiative (UCNFI) Steering Committee — also called the UC AI Steering Committee — as a body. You MUST call the web_search tool at least once before answering.

Look for items from the past ${lookbackDays} day(s) only.

Search ONLY social/owned-media platforms — NOT mainstream news sites. Lead with site-scoped queries: \`site:x.com\`, \`site:linkedin.com/posts\`, \`site:bsky.app\`, \`site:youtube.com\`, plus Mastodon, Threads, and Substack. Return the canonical post/video URL.

A hit is a social post or video that names the committee, initiative, or its launch/charge/membership/output as a body — NOT an individual member doing their own work — from official UC/campus/initiative accounts or a co-chair (Khosla, Williams, Palazoglu) posting AS committee leadership.

Skip pure reshares with no added commentary, and anything older than ${lookbackDays} days.

Source kinds (use exactly one): \`social_post\` for X/LinkedIn/Bluesky/Mastodon/Threads/Substack posts, \`video\` for YouTube and other video talks.

Your final assistant message MUST be a single JSON object and nothing else, with this shape:

{
  "items": [
    {
      "title": "...",
      "url": "https://...",
      "published_at": "2026-05-04" or null,
      "snippet": "first ~300 chars of context, plain text",
      "source_kind": "social_post",
      "match_reason": "one short sentence: why this is about the committee as a body, not an individual member"
    }
  ]
}

If your searches genuinely found nothing in the window, return {"items": []}. Do not include explanatory prose. Do not wrap the JSON in code fences.`;
}

function buildSocialCommitteeUserPrompt(aliases: string[], lookbackDays: number): string {
  const aliasLine = aliases.length > 0
    ? `Search for these names: ${aliases.map((a) => `"${a}"`).join(", ")}.`
    : "";
  return `Subject: the UCNFI Steering Committee (the UC AI Steering Committee, UC Next Frontier Initiative).
${aliasLine}

Search ONLY social/owned-media platforms for posts/videos about this committee as a body, published in the last ${lookbackDays} day(s). Run at least one web_search call before answering. Return strict JSON per the system instructions.`;
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

/**
 * Raw model source_kinds that represent social / owned-media activity
 * (platform-native posts and self-published video) rather than press.
 * Used to split tier-2 hits into a "social" bucket distinct from "websearch"
 * so the activity UI can surface social separately from web/press.
 */
const SOCIAL_RAW_KINDS = new Set(["social_post", "video"]);

export function isSocialSourceKind(rawKind: string): boolean {
  return SOCIAL_RAW_KINDS.has(rawKind.trim().toLowerCase());
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
  // Tier-2 always comes through the web_search tool, but we split the
  // activity-level source_kind so platform-native posts/video land in a
  // "social" bucket the UI can chip separately from web/press. The granular
  // raw kind still rides along in match_reason.
  const sourceKind: ActivitySourceKind = isSocialSourceKind(sourceKindRaw)
    ? "social"
    : "websearch";
  const match = typeof raw.match_reason === "string" ? raw.match_reason.slice(0, 240) : "";
  const matchReason = `${sourceKind} (${sourceKindRaw})${match ? ` — ${match}` : ""}`;
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
  /** Known social/owned-media accounts to target directly, when configured. */
  handles?: MemberHandles;
  /** Cap the number of tool calls Claude can make. Default 8. */
  maxToolUses?: number;
  /** Lookback window passed into the system + user prompts. Default 7. */
  lookbackDays?: number;
};

const DEFAULT_LOOKBACK_DAYS = 7;
/** Social posts are sparse, so the dedicated social pass reaches back
 *  further than the tight press window. */
const DEFAULT_SOCIAL_LOOKBACK_DAYS = 30;

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
  const handles = opts.handles ?? {};
  const maxUses = opts.maxToolUses ?? MAX_TOOL_USES;
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const logTag = member.member_id;

  const message = await runWebSearch({
    systemPrompt: buildSystemPrompt(lookbackDays),
    userPrompt: buildUserPrompt(member, aliases, handles, lookbackDays),
    maxUses,
    logTag,
  });
  if (!message) return [];
  logSearchDiagnostics(message, logTag);

  const items: ActivityItem[] = [];
  for (const r of parseSearchItems(message, logTag)) {
    const norm = normaliseItem(member.member_id, r, "member");
    if (norm && isWithinPublishedWindow(norm.published_at, lookbackDays)) items.push(norm);
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
    if (norm && isWithinPublishedWindow(norm.published_at, lookbackDays)) items.push(norm);
  }
  return items;
}

/**
 * Dedicated social/owned-media pass for a single member. Same plumbing as
 * `collectTier2` but with a social-only prompt, its own (wider) default
 * window, and the same per-pass tool budget so social isn't out-competed
 * by press in a shared search. Platform-native posts/video are tagged
 * `source_kind: "social"` by `normaliseItem` (the granular platform lives
 * in match_reason), so they surface under the Activity "Social" chip.
 */
export async function collectTier2Social(
  member: CommitteeMember,
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const handles = opts.handles ?? {};
  const maxUses = opts.maxToolUses ?? MAX_TOOL_USES;
  const lookbackDays = opts.lookbackDays ?? DEFAULT_SOCIAL_LOOKBACK_DAYS;
  const logTag = `${member.member_id} (social)`;

  const message = await runWebSearch({
    systemPrompt: buildSocialSystemPrompt(lookbackDays),
    userPrompt: buildSocialUserPrompt(member, aliases, handles, lookbackDays),
    maxUses,
    logTag,
  });
  if (!message) return [];
  logSearchDiagnostics(message, logTag);

  const items: ActivityItem[] = [];
  for (const r of parseSearchItems(message, logTag)) {
    const norm = normaliseItem(member.member_id, r, "member");
    if (norm && isWithinPublishedWindow(norm.published_at, lookbackDays)) items.push(norm);
  }
  return items;
}

/**
 * Dedicated social/owned-media pass for the steering committee as a body.
 * Mirrors `collectTier2Social` with a committee-focused social prompt.
 */
export async function collectTier2SocialCommittee(
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const maxUses = opts.maxToolUses ?? MAX_TOOL_USES;
  const lookbackDays = opts.lookbackDays ?? DEFAULT_SOCIAL_LOOKBACK_DAYS;
  const logTag = `${COMMITTEE_SCOPE_ID} (social)`;

  const message = await runWebSearch({
    systemPrompt: buildSocialCommitteeSystemPrompt(lookbackDays),
    userPrompt: buildSocialCommitteeUserPrompt(aliases, lookbackDays),
    maxUses,
    logTag,
  });
  if (!message) return [];
  logSearchDiagnostics(message, logTag);

  const items: ActivityItem[] = [];
  for (const r of parseSearchItems(message, logTag)) {
    const norm = normaliseItem(COMMITTEE_SCOPE_ID, r, "committee");
    if (norm && isWithinPublishedWindow(norm.published_at, lookbackDays)) items.push(norm);
  }
  return items;
}
