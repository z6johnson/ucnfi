/**
 * Tier-2 collector: live web search via a Google-Search-grounded Gemini
 * model (default `gemini-3.5-flash`) over the UCSD TritonAI LiteLLM proxy.
 * Catches op-eds, podcasts, interviews, and press quotes that don't appear
 * in any structured feed.
 *
 * Replaces the retired `internet_tool` MCP path: the gateway stopped
 * advertising that MCP server, so tier-2 went silent. Gemini grounding does
 * the searching server-side in a single call — we send a "return strict
 * JSON" prompt and read the model's answer. Each item's URL is corroborated
 * against the response's grounding citations so a hallucinated URL can't
 * enter the ledger. The lookback window is parameterised via
 * `WebSearchOptions.lookbackDays` so the same code drives both the normal
 * daily run and wider backfills.
 *
 * The grounded call (runGroundedSearch), the date-pinning helper, the
 * JSON-response parsing, and the citation corroboration live in
 * ../search/grounded-search.ts so the weekly Brief can reuse them. This file
 * keeps the committee-scan-specific prompts, item normalization, and the
 * published tier-2 collectors.
 */

import {
  type ActivityItem,
  type ActivityScope,
  type ActivitySourceKind,
  COMMITTEE_SCOPE_ID,
  TOPIC_SCOPE_ID,
  itemId,
  isoNowUTC,
} from "../activity.ts";
import { type CommitteeMember } from "../committee.ts";
import {
  type GroundedResult,
  type RawWebItem,
  corroborateWithCitations,
  dateContextLine,
  parseSearchItems,
  runGroundedSearch,
} from "../search/grounded-search.ts";

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
  return `You scan public web sources for recent AI-related output by one named member of the UCOP AI Steering Committee. Ground every answer in live web search results, not prior knowledge.

${dateContextLine(lookbackDays)}

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

Search the public web — including social platforms — for AI-related output by this person published in the last ${lookbackDays} day(s). Base your answer on live web search results. Return strict JSON per the system instructions.`;
}

function buildCommitteeSystemPrompt(lookbackDays: number): string {
  return `You scan public web sources for recent mentions of the UCOP AI Steering Committee — also called the UC AI Steering Committee — as a body. Ground every answer in live web search results, not prior knowledge.

${dateContextLine(lookbackDays)}

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
  return `Subject: the UCOP AI Steering Committee (also known as the UC AI Steering Committee).
${aliasLine}

Search the public web — including social platforms — for items about this committee as a body, published in the last ${lookbackDays} day(s). Base your answer on live web search results. Return strict JSON per the system instructions.`;
}

/* ------------------------------------------------------------------ */
/* Topic / field-news prompts                                          */
/* ------------------------------------------------------------------ */
/* A scope for AI-in-higher-education / AI-policy news relevant to the
 * committee's charge even when NO individual member and NOT the committee
 * as a body is named — e.g. a UC study on student AI use, a peer-system
 * AI policy, an academic-integrity report. Unlike the member/committee
 * scopes, the "is this the right entity?" gate is replaced by a
 * topical-relevance gate. */

function buildTopicSystemPrompt(lookbackDays: number): string {
  return `You scan public web sources for recent AI-in-higher-education news relevant to the UCOP AI Steering Committee's charge — even when no individual committee member and not the committee itself is named. Ground every answer in live web search results, not prior knowledge.

${dateContextLine(lookbackDays)}

A hit is an item that:
  (a) concerns AI within the committee's mandate: AI in teaching, learning, or research; academic integrity and assessment; AI access/equity for students; AI governance, policy, or regulation at the University of California or peer research universities (R1s); or a major study, survey, or report on AI use in higher education, AND
  (b) is published in a credible venue: UC newsroom or campus communications, UCOP press, peer-university communications, mainstream press, trade press (Inside Higher Ed, Chronicle of Higher Education, EdSurge), policy or research outlets, or official UC/peer system pages.

This scope is deliberately broad. INCLUDE UC and peer-university studies, reports, surveys, op-eds, and policy news about AI in higher education even when authored or led by people who are NOT on the committee — that is exactly the field context the committee needs. Do not require that a committee member or the committee be named.

Cover both mainstream press and credible web sources. Return the canonical article/report URL, not a search or aggregator URL.

Skip:
  - generic AI-industry/product news with no higher-education angle
  - opinion spam, SEO content farms, and aggregator/listicle pages
  - vendor marketing
  - anything older than ${lookbackDays} days

Return at most ${TOPIC_MAX_ITEMS} of the most relevant items, newest and most clearly on-mandate first. Keep each snippet to roughly 300 characters.

Source kinds (use exactly one of these strings): news_article, publication, op_ed, position_statement, blog_post, podcast, video, press_release, other. Use \`publication\` for studies/reports/papers and \`news_article\` for press coverage.

Your final assistant message MUST be a single JSON object and nothing else, with this shape:

{
  "items": [
    {
      "title": "...",
      "url": "https://...",
      "published_at": "2026-05-21" or null,
      "snippet": "first ~300 chars of context, plain text",
      "source_kind": "news_article",
      "match_reason": "one short sentence: why this AI-in-higher-ed item is relevant to the committee's charge"
    }
  ]
}

If your searches genuinely found nothing in the window, return {"items": []}. Do not include explanatory prose. Do not wrap the JSON in code fences.`;
}

function buildTopicUserPrompt(topics: string[], lookbackDays: number): string {
  const topicLine = topics.length > 0
    ? `Lead with these topic queries: ${topics.map((t) => `"${t}"`).join(", ")}.`
    : "";
  return `Subject: AI-in-higher-education news relevant to the University of California AI Steering Committee's charge.
${topicLine}

Search the public web for AI-in-higher-education / AI-policy items published in the last ${lookbackDays} day(s), including UC and peer-university studies and reports even when no committee member is named. Base your answer on live web search results. Return strict JSON per the system instructions.`;
}

/* ------------------------------------------------------------------ */
/* Social-only prompts                                                 */
/* ------------------------------------------------------------------ */
/* A dedicated pass scoped to social/owned media. The combined press+social
 * search lets easy press hits eat the tool budget, so social posts rarely
 * surface; this pass searches only the platforms, with its own (wider)
 * window, so sparse social content gets found. */

function buildSocialSystemPrompt(lookbackDays: number): string {
  return `You scan PUBLIC SOCIAL and OWNED MEDIA for recent AI-related output by one named member of the UCOP AI Steering Committee. Ground every answer in live web search results, not prior knowledge.

${dateContextLine(lookbackDays)}

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

Search ONLY social/owned-media platforms for AI-related posts/videos by this person published in the last ${lookbackDays} day(s). Prefer the known accounts above when present. Base your answer on live web search results. Return strict JSON per the system instructions.`;
}

function buildSocialCommitteeSystemPrompt(lookbackDays: number): string {
  return `You scan PUBLIC SOCIAL and OWNED MEDIA for recent posts/videos about the UCOP AI Steering Committee — also called the UC AI Steering Committee — as a body. Ground every answer in live web search results, not prior knowledge.

${dateContextLine(lookbackDays)}

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
  return `Subject: the UCOP AI Steering Committee (also known as the UC AI Steering Committee).
${aliasLine}

Search ONLY social/owned-media platforms for posts/videos about this committee as a body, published in the last ${lookbackDays} day(s). Base your answer on live web search results. Return strict JSON per the system instructions.`;
}

/* ------------------------------------------------------------------ */
/* Item normalization                                                  */
/* ------------------------------------------------------------------ */

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

/**
 * Parse the grounded answer into scoped items, drop stale hits, and keep
 * only URLs a grounding citation backs. Shared by every collector below.
 */
function finalizeItems(
  res: GroundedResult,
  memberId: string,
  scope: ActivityScope,
  lookbackDays: number,
  logTag: string,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const r of parseSearchItems(res.text, logTag)) {
    const norm = normaliseItem(memberId, r, scope);
    if (norm && isWithinPublishedWindow(norm.published_at, lookbackDays)) items.push(norm);
  }
  return corroborateWithCitations(items, res.citations, (m) =>
    console.warn(`[scan] tier-2 ${logTag} ${m}`),
  );
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type WebSearchOptions = {
  searchAliases?: string[];
  /** Known social/owned-media accounts to target directly, when configured. */
  handles?: MemberHandles;
  /** Lookback window passed into the system + user prompts. Default 7. */
  lookbackDays?: number;
};

const DEFAULT_LOOKBACK_DAYS = 7;
/** Social posts are sparse, so the dedicated social pass reaches back
 *  further than the tight press window. */
const DEFAULT_SOCIAL_LOOKBACK_DAYS = 30;
/** Field news runs less surgically than member press: a wider default
 *  window shrinks the gap between scans so a relevant story published
 *  mid-week isn't missed by a tight 7-day press window. */
const DEFAULT_TOPIC_LOOKBACK_DAYS = 14;
/** The topic pass returns a longer list than the per-entity passes, so its
 *  final JSON needs more output headroom than the shared 2048 default to
 *  avoid mid-answer truncation. Paired with the item cap in the prompt. */
const TOPIC_MAX_TOKENS = 4096;
/** Hard cap on items the topic pass returns, so the JSON answer stays well
 *  within TOPIC_MAX_TOKENS even on a busy news week. */
const TOPIC_MAX_ITEMS = 10;

export async function collectTier2(
  member: CommitteeMember,
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const handles = opts.handles ?? {};
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const logTag = member.member_id;

  const res = await runGroundedSearch({
    systemPrompt: buildSystemPrompt(lookbackDays),
    userPrompt: buildUserPrompt(member, aliases, handles, lookbackDays),
    logTag,
  });
  if (!res) return [];
  console.info(`[scan] tier-2 ${logTag} stop=${res.stop} citations=${res.citations.length}`);
  return finalizeItems(res, member.member_id, "member", lookbackDays, logTag);
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
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const logTag = COMMITTEE_SCOPE_ID;

  const res = await runGroundedSearch({
    systemPrompt: buildCommitteeSystemPrompt(lookbackDays),
    userPrompt: buildCommitteeUserPrompt(aliases, lookbackDays),
    logTag,
  });
  if (!res) return [];
  console.info(`[scan] tier-2 ${logTag} stop=${res.stop} citations=${res.citations.length}`);
  return finalizeItems(res, COMMITTEE_SCOPE_ID, "committee", lookbackDays, logTag);
}

/**
 * Tier-2 collector for AI-in-higher-education "field news" relevant to the
 * committee's charge. Mirrors `collectTier2Committee` but uses a
 * topical-relevance prompt instead of an entity gate, and stamps items
 * with `scope: "topic"` and `member_id: TOPIC_SCOPE_ID`. The default
 * window is wider (14d) than the member press window.
 */
export async function collectTier2Topic(
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const topics = opts.searchAliases ?? [];
  const lookbackDays = opts.lookbackDays ?? DEFAULT_TOPIC_LOOKBACK_DAYS;
  const logTag = TOPIC_SCOPE_ID;

  const res = await runGroundedSearch({
    systemPrompt: buildTopicSystemPrompt(lookbackDays),
    userPrompt: buildTopicUserPrompt(topics, lookbackDays),
    logTag,
    // The topic pass is the broadest search and returns the longest list;
    // give the JSON answer extra headroom so it isn't truncated (truncation
    // makes it unparseable and silently drops every item).
    maxTokens: TOPIC_MAX_TOKENS,
  });
  if (!res) return [];
  console.info(`[scan] tier-2 ${logTag} stop=${res.stop} citations=${res.citations.length}`);
  return finalizeItems(res, TOPIC_SCOPE_ID, "topic", lookbackDays, logTag);
}

/**
 * Dedicated social/owned-media pass for a single member. Same plumbing as
 * `collectTier2` but with a social-only prompt and its own (wider) default
 * window, so sparse social content isn't out-competed by press in a shared
 * search. Platform-native posts/video are tagged
 * `source_kind: "social"` by `normaliseItem` (the granular platform lives
 * in match_reason), so they surface under the Activity "Social" chip.
 */
export async function collectTier2Social(
  member: CommitteeMember,
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const handles = opts.handles ?? {};
  const lookbackDays = opts.lookbackDays ?? DEFAULT_SOCIAL_LOOKBACK_DAYS;
  const logTag = `${member.member_id} (social)`;

  const res = await runGroundedSearch({
    systemPrompt: buildSocialSystemPrompt(lookbackDays),
    userPrompt: buildSocialUserPrompt(member, aliases, handles, lookbackDays),
    logTag,
  });
  if (!res) return [];
  console.info(`[scan] tier-2 ${logTag} stop=${res.stop} citations=${res.citations.length}`);
  return finalizeItems(res, member.member_id, "member", lookbackDays, logTag);
}

/**
 * Dedicated social/owned-media pass for the steering committee as a body.
 * Mirrors `collectTier2Social` with a committee-focused social prompt.
 */
export async function collectTier2SocialCommittee(
  opts: WebSearchOptions = {},
): Promise<ActivityItem[]> {
  const aliases = opts.searchAliases ?? [];
  const lookbackDays = opts.lookbackDays ?? DEFAULT_SOCIAL_LOOKBACK_DAYS;
  const logTag = `${COMMITTEE_SCOPE_ID} (social)`;

  const res = await runGroundedSearch({
    systemPrompt: buildSocialCommitteeSystemPrompt(lookbackDays),
    userPrompt: buildSocialCommitteeUserPrompt(aliases, lookbackDays),
    logTag,
  });
  if (!res) return [];
  console.info(`[scan] tier-2 ${logTag} stop=${res.stop} citations=${res.citations.length}`);
  return finalizeItems(res, COMMITTEE_SCOPE_ID, "committee", lookbackDays, logTag);
}
