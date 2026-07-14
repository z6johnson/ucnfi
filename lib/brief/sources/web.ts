/**
 * Feed #5 — live web search.
 *
 * Uses a Google-Search-grounded Gemini model (default `gemini-3.5-flash`)
 * over the UCSD TritonAI LiteLLM proxy — the same grounded search the
 * committee activity scan uses — to find recent AI developments forcing a
 * University of California decision that the curated RSS feeds miss:
 * federal/state AI policy & regulation, court rulings, peer-university AI
 * moves, major vendor/capability shifts, and AI-in-higher-ed news. Augments
 * the RSS collectors; the discovered items are handed to the same synthesis
 * call as additional BriefRawItems.
 *
 * Items are emitted as feed_kind="external" with subkind="web_search" so
 * they flow through the existing FeedSource union, validator, and renderer
 * with no schema change. URLs are canonicalized to match how the validator
 * resolves feed_sources (lib/brief/validate.ts builds its byUrl map from
 * canonical URLs), and the recency gate is anchored to endDate via
 * lib/brief/recency.ts — consistent with the other collectors.
 */

import { canonicalUrl, isoNowUTC, itemId } from "../../activity.ts";
import {
  type GroundedResult,
  anchorToCitations,
  dateContextLine,
  dropDeadUrls,
  parseSearchItems,
  resolveCitations,
  runGroundedSearch,
} from "../../search/grounded-search.ts";
import { isFresh, windowBounds } from "../recency.ts";
import type { BriefRawItem } from "../types.ts";

export type CollectWebOpts = {
  /** Lookback window (days, inclusive of endDate) for web results. */
  lookbackDays: number;
  /** Brief end date; the recency window is anchored here, never wall-clock now. */
  endDate: Date;
};

function buildSystemPrompt(lookbackDays: number): string {
  return `You scan the public web for recent developments in artificial intelligence that force a University of California (UC) decision or response. Ground every answer in live web search results, not prior knowledge.

${dateContextLine(lookbackDays)}

Cover developments such as:
  - Federal AI policy, regulation, executive actions, and agency guidance (e.g. Dept. of Education, OCR, NIST, the White House)
  - California state AI legislation, regulation, and budget actions
  - Court rulings and litigation touching AI in education, copyright, privacy, or employment
  - Peer-university and university-system AI moves (policies, task forces, partnerships, deployments)
  - Major AI vendor and capability shifts (model releases, enterprise/education deals, pricing, safety incidents) that change what UC can or must do
  - AI-in-higher-education developments (accreditation, academic integrity, research security, procurement)

A hit is an item that:
  (a) describes a concrete, datable development published within the last ${lookbackDays} day(s), AND
  (b) plausibly forces or informs a UC-level decision — not generic AI commentary or explainer content.

Prefer primary and authoritative sources (government, court, official university, or the vendor itself) and major press over aggregators. Return the canonical article/document URL, not a search or aggregator URL. Skip opinion roundups, listicles, and anything older than ${lookbackDays} days.

Source kinds (use exactly one of these strings): policy, regulation, legislation, court_ruling, peer_move, vendor_shift, higher_ed, press, other.

Your final assistant message MUST be a single JSON object and nothing else, with this shape:

{
  "items": [
    {
      "title": "...",
      "url": "https://...",
      "published_at": "2026-05-21" or null,
      "snippet": "first ~300 chars of context, plain text",
      "source_kind": "policy",
      "match_reason": "one short sentence: why this forces or informs a UC decision"
    }
  ]
}

If your searches genuinely found nothing in the window, return {"items": []}. Do not include explanatory prose. Do not wrap the JSON in code fences.`;
}

function buildUserPrompt(lookbackDays: number): string {
  return `Search the public web for AI developments forcing a UC decision, published in the last ${lookbackDays} day(s). Base your answer on live web search results. Return strict JSON per the system instructions.`;
}

function stringOrEmpty(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function parseIsoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export async function collectWeb(opts: CollectWebOpts): Promise<BriefRawItem[]> {
  const lookbackDays = opts.lookbackDays;

  let res: GroundedResult | null;
  try {
    res = await runGroundedSearch({
      systemPrompt: buildSystemPrompt(lookbackDays),
      userPrompt: buildUserPrompt(lookbackDays),
      logTag: "web",
      logPrefix: "[brief]",
    });
  } catch (err) {
    console.warn(`[brief] web search failed err=${(err as Error).message}`);
    return [];
  }
  // Search unreachable → skip rather than let the model invent URLs.
  if (!res) return [];
  console.info(`[brief] web search stop=${res.stop} citations=${res.citations.length}`);

  const { startMs, endMs } = windowBounds(opts.endDate, lookbackDays);
  const discoveredAt = isoNowUTC();
  const out: BriefRawItem[] = [];
  for (const r of parseSearchItems(res.text, "web", "[brief]")) {
    const rawUrl = typeof r.url === "string" ? r.url.trim() : "";
    if (!/^https?:\/\//i.test(rawUrl)) continue;
    const url = canonicalUrl(rawUrl);
    const title = stringOrEmpty(r.title, 300);
    if (!title) continue;
    const sourceKind = stringOrEmpty(r.source_kind, 40) || "other";
    const reason = stringOrEmpty(r.match_reason, 240);
    const item: BriefRawItem = {
      id: itemId(url),
      feed_kind: "external",
      subkind: "web_search",
      title,
      url,
      published_at: parseIsoOrNull(r.published_at),
      snippet: stringOrEmpty(r.snippet, 400),
      match_reason: `web_search (${sourceKind})${reason ? ` — ${reason}` : ""}`,
      discovered_at: discoveredAt,
    };
    // Anchor recency to endDate (published_at, else discovered_at fallback),
    // matching the other brief collectors.
    if (isFresh(item, startMs, endMs)) out.push(item);
  }
  // Replace each item's fabricated URL with the real grounding citation it
  // belongs to (the model routinely guesses plausible-but-wrong URLs on the
  // wrong host), then drop any link that's definitively dead (404/410).
  const warn = (m: string) => console.warn(`[brief] web ${m}`);
  const citations = await resolveCitations(res.citations);
  const anchored = anchorToCitations(out, citations, warn);
  // anchorToCitations may swap in a citation URL; re-canonicalize it and
  // recompute the id (the validator keys feed_sources by canonical URL).
  const reidentified = anchored.map((it) => {
    const url = canonicalUrl(it.url);
    return { ...it, url, id: itemId(url) };
  });
  return dropDeadUrls(reidentified, warn);
}
