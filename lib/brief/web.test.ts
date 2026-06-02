import { test } from "node:test";
import assert from "node:assert/strict";

import { canonicalUrl, itemId } from "../activity.ts";
import { windowBounds } from "./recency.ts";
import { validateItems, type ValidateWindow } from "./validate.ts";
import type { BriefItem, BriefRawItem } from "./types.ts";

const END = new Date("2026-05-28T12:00:00Z");

function makeWindow(): ValidateWindow {
  const strict = windowBounds(END, 7);
  const grace = windowBounds(END, 30);
  return {
    strictStartMs: strict.startMs,
    committeeStartMs: grace.startMs,
    endMs: strict.endMs,
    strictLabel: `${strict.startIso}..${strict.endIso}`,
    committeeLabel: `${grace.startIso}..${grace.endIso}`,
  };
}

/**
 * Build a web-discovered raw item the way lib/brief/sources/web.ts does:
 * canonicalized URL, id derived from that canonical URL, feed_kind=external,
 * subkind=web_search.
 */
function makeWebRaw(opts: { url: string; published_at: string | null }): BriefRawItem {
  const url = canonicalUrl(opts.url);
  return {
    id: itemId(url),
    feed_kind: "external",
    subkind: "web_search",
    title: "A web-search development",
    url,
    published_at: opts.published_at,
    snippet: "",
    match_reason: "web_search (policy)",
    discovered_at: "2026-05-28T00:00:00Z",
  };
}

function makeItem(opts: {
  feedUrl: string;
  published_at: string | null;
}): BriefItem {
  return {
    item_id: "item-1",
    priority: 1,
    headline: "Headline",
    what_happened: "Something happened.",
    why_it_matters: "It matters.",
    for_the_committee: "A question?",
    feed_sources: [
      {
        kind: "external",
        subkind: "web_search",
        url: opts.feedUrl,
        title: "A web-search development",
        published_at: opts.published_at,
      },
    ],
    // baseline_missing is valid regardless of entity, isolating the source gate.
    baseline_anchors: [
      { entity_id: "ucop_systemwide", dimension: "policy", field: "made_up", claim_kind: "baseline_missing" },
    ],
    peer_anchors: [],
    experts: [],
  };
}

test("an in-window external/web_search source with a matching raw item passes", () => {
  const raw = makeWebRaw({ url: "https://example.gov/ai-rule", published_at: "2026-05-25" });
  const item = makeItem({ feedUrl: raw.url, published_at: "2026-05-25" });
  const result = validateItems([item], [raw], makeWindow());
  assert.equal(result.accepted.length, 1, JSON.stringify(result.rejected));
});

test("a web_search source with null published_at falls back to the raw discovered_at", () => {
  // discovered_at (2026-05-28) is inside the window, so an undated web hit
  // whose URL resolves in the raw set still passes.
  const raw = makeWebRaw({ url: "https://example.gov/ai-rule", published_at: null });
  const item = makeItem({ feedUrl: raw.url, published_at: null });
  const result = validateItems([item], [raw], makeWindow());
  assert.equal(result.accepted.length, 1, JSON.stringify(result.rejected));
});

test("a web_search source whose URL does not resolve in the raw set and has no date is rejected", () => {
  // The model echoed a non-canonical / unlisted URL, so byUrl misses and there
  // is no discovered_at fallback — the date gate drops it. This is the
  // canonicalization contract the collector must uphold.
  const raw = makeWebRaw({ url: "https://example.gov/ai-rule", published_at: null });
  const item = makeItem({ feedUrl: "https://example.gov/ai-rule?utm_source=x", published_at: null });
  const result = validateItems([item], [raw], makeWindow());
  assert.equal(result.accepted.length, 0);
  assert.ok(
    result.rejected[0].reasons.some((r) => /outside the brief window/.test(r)),
    `expected a window-recency reason, got: ${JSON.stringify(result.rejected[0]?.reasons)}`,
  );
});

test("a stale-dated external/web_search source is rejected by the date gate", () => {
  const raw = makeWebRaw({ url: "https://example.gov/ai-rule", published_at: "2025-07-12" });
  const item = makeItem({ feedUrl: raw.url, published_at: "2025-07-12" });
  const result = validateItems([item], [raw], makeWindow());
  assert.equal(result.accepted.length, 0);
  assert.ok(
    result.rejected[0].reasons.some((r) => /outside the brief window/.test(r)),
    `expected a window-recency reason, got: ${JSON.stringify(result.rejected[0]?.reasons)}`,
  );
});
