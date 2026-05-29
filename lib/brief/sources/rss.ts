/**
 * Shared RSS / Atom collector for brief feeds.
 *
 * Copies the parse/fetch/keyword-filter logic from lib/scan/feeds.ts
 * but emits BriefRawItem instead of ActivityItem and uses a wider
 * "is this a decision-shaped move" keyword set rather than the
 * narrower "is this AI" filter the activity scan uses.
 *
 * This is intentionally a parallel implementation rather than an
 * import: lib/scan/feeds.ts is tightly coupled to ActivityItem and
 * member_id, and contorting it would obscure the brief-specific
 * keyword set.
 */

import { XMLParser } from "fast-xml-parser";
import { canonicalUrl, isoNowUTC, itemId } from "../../activity.ts";
import { isFresh, windowBounds } from "../recency.ts";
import type { BriefRawItem, FeedSourceKind } from "../types.ts";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "ucnfi-brief/0.1 (+https://github.com/z6johnson/ucnfi)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

/* ------------------------------------------------------------------ */
/* Keyword filter — wider than the activity scan                       */
/* ------------------------------------------------------------------ */

const RELEVANCE_KEYWORDS = [
  "artificial intelligence",
  "machine learning",
  "generative",
  "large language model",
  "foundation model",
  "ai governance",
  "ai policy",
  "ai safety",
  "ai ethics",
  "automated decision",
  "algorithmic",
  "chatbot",
  "llm",
  "gpt",
  "claude",
  "gemini",
  "copilot",
  "openai",
  "anthropic",
  "deepfake",
  "model training",
  "executive order",
  "rulemaking",
  "guidance",
  "interim rule",
  "final rule",
];

const AI_TOKEN_REGEX = /\b(ai|a\.i\.)\b/i;

function isRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  for (const k of RELEVANCE_KEYWORDS) {
    if (lower.includes(k)) return true;
  }
  return AI_TOKEN_REGEX.test(text);
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/atom+xml, application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */
/* Parse                                                               */
/* ------------------------------------------------------------------ */

type RawEntry = {
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string;
};

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function pickText(node: unknown): string {
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    const t = (node as Record<string, unknown>)["#text"];
    return typeof t === "string" ? t : "";
  }
  return "";
}

function pickLink(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    const alt = node.find(
      (l) =>
        typeof l === "object" &&
        l &&
        "@_rel" in l &&
        l["@_rel"] === "alternate",
    );
    const chosen = alt ?? node[0];
    if (chosen && typeof chosen === "object" && "@_href" in chosen) {
      return String(chosen["@_href"] ?? "");
    }
    return "";
  }
  if (node && typeof node === "object" && "@_href" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["@_href"] ?? "");
  }
  return "";
}

function parseDate(s: string): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function parseFeed(xml: string): RawEntry[] {
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    return [];
  }
  const root = parsed as Record<string, unknown>;
  const rss = root.rss as Record<string, unknown> | undefined;
  if (rss?.channel) {
    const channel = rss.channel as Record<string, unknown>;
    return asArray<Record<string, unknown>>(
      channel.item as Record<string, unknown> | Record<string, unknown>[] | undefined,
    ).map((item) => ({
      title: pickText(item.title) || String(item.title ?? ""),
      url: pickText(item.link) || String(item.link ?? ""),
      publishedAt: parseDate(String(item.pubDate ?? item["dc:date"] ?? "")),
      summary: stripHtml(pickText(item.description) || String(item.description ?? "")),
    }));
  }
  if (root.feed) {
    const feed = root.feed as Record<string, unknown>;
    return asArray<Record<string, unknown>>(
      feed.entry as Record<string, unknown> | Record<string, unknown>[] | undefined,
    ).map((entry) => ({
      title: pickText(entry.title) || String(entry.title ?? ""),
      url: pickLink(entry.link),
      publishedAt: parseDate(String(entry.published ?? entry.updated ?? "")),
      summary: stripHtml(pickText(entry.summary) || pickText(entry.content) || ""),
    }));
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Public collector                                                    */
/* ------------------------------------------------------------------ */

export type CollectRssOpts = {
  feedKind: FeedSourceKind;
  subkind: string;
  /** Recency window length in days, inclusive of endDate. */
  lookbackDays: number;
  /** Brief end date; the recency window is anchored here, not wall-clock. */
  endDate: Date;
  skipKeywordFilter?: boolean;
  /** Stamped on emitted items as match_reason context. */
  contextLabel?: string;
  /** Carried through to BriefRawItem for committee_signal / peer feeds. */
  memberId?: string;
  peerId?: string;
};

export async function collectFromRss(
  feedUrl: string,
  opts: CollectRssOpts,
): Promise<BriefRawItem[]> {
  const xml = await fetchText(feedUrl);
  const entries = parseFeed(xml);
  const { startMs, endMs } = windowBounds(opts.endDate, opts.lookbackDays);
  // discovered_at is the recency fallback for entries with no parseable
  // published_at; compute it once so the filter and the emitted item agree.
  const discoveredAt = isoNowUTC();
  const out: BriefRawItem[] = [];
  for (const e of entries) {
    if (!e.url) continue;
    if (!isFresh({ published_at: e.publishedAt, discovered_at: discoveredAt }, startMs, endMs)) {
      continue;
    }
    const blob = `${e.title} ${e.summary}`;
    if (!opts.skipKeywordFilter && !isRelevant(blob)) continue;
    const canonical = canonicalUrl(e.url);
    out.push({
      id: itemId(e.url),
      feed_kind: opts.feedKind,
      subkind: opts.subkind,
      title: e.title.trim().slice(0, 300),
      url: canonical,
      published_at: e.publishedAt,
      snippet: e.summary,
      match_reason: opts.contextLabel
        ? `${opts.subkind} — ${opts.contextLabel}`
        : opts.subkind,
      discovered_at: discoveredAt,
      ...(opts.memberId ? { member_id: opts.memberId } : {}),
      ...(opts.peerId ? { peer_id: opts.peerId } : {}),
    });
  }
  return out;
}
