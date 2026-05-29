import { test } from "node:test";
import assert from "node:assert/strict";

import { validateItems, type ValidateWindow } from "./validate.ts";
import { windowBounds } from "./recency.ts";
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

function makeItem(publishedAt: string): { item: BriefItem; raw: BriefRawItem } {
  const url = "https://example.com/story";
  const raw: BriefRawItem = {
    id: "raw1",
    feed_kind: "committee_signal",
    subkind: "member",
    title: "A committee signal",
    url,
    published_at: publishedAt,
    snippet: "",
    match_reason: "",
    discovered_at: "2026-05-28T00:00:00Z",
    member_id: "committee",
  };
  const item: BriefItem = {
    item_id: "item-1",
    priority: 4,
    headline: "Headline",
    what_happened: "Something happened.",
    why_it_matters: "It matters.",
    for_the_committee: "A question?",
    feed_sources: [
      {
        kind: "committee_signal",
        activity_item_id: "raw1",
        member_id: "committee",
        url,
        title: "A committee signal",
        published_at: publishedAt,
      },
    ],
    // baseline_missing is valid regardless of entity, isolating the date gate.
    baseline_anchors: [
      { entity_id: "ucop_systemwide", dimension: "policy", field: "made_up", claim_kind: "baseline_missing" },
    ],
    peer_anchors: [],
    experts: [],
  };
  return { item, raw };
}

test("a committee_signal source from 2025-07-12 is rejected by the date gate", () => {
  const { item, raw } = makeItem("2025-07-12");
  const result = validateItems([item], [raw], makeWindow());
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.ok(
    result.rejected[0].reasons.some((r) => /outside the brief window/.test(r)),
    `expected a window-recency reason, got: ${JSON.stringify(result.rejected[0].reasons)}`,
  );
});

test("an in-window committee_signal source passes the date gate", () => {
  const { item, raw } = makeItem("2026-05-25");
  const result = validateItems([item], [raw], makeWindow());
  assert.equal(result.accepted.length, 1, JSON.stringify(result.rejected));
});

test("without a window the date gate is skipped (legacy behavior)", () => {
  const { item, raw } = makeItem("2025-07-12");
  const result = validateItems([item], [raw]);
  assert.equal(result.accepted.length, 1);
});
