import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isSocialSourceKind, isWithinPublishedWindow } from "./websearch.ts";

// Fixed "now" so the assertions are deterministic regardless of wall clock.
const NOW = Date.parse("2026-06-01T00:00:00.000Z");

test("keeps items with no usable published date", () => {
  // Undatable posts come back as null; dropping them would throw away
  // fresh-but-undated social content, so they must pass.
  assert.equal(isWithinPublishedWindow(null, 7, NOW), true);
  assert.equal(isWithinPublishedWindow("not-a-date", 7, NOW), true);
});

test("keeps a date inside the window", () => {
  assert.equal(isWithinPublishedWindow("2026-05-28T00:00:00.000Z", 7, NOW), true);
  assert.equal(isWithinPublishedWindow("2026-05-10T00:00:00.000Z", 30, NOW), true);
});

test("drops a stale 2025 date under both press and social windows", () => {
  assert.equal(isWithinPublishedWindow("2025-07-11T00:00:00.000Z", 7, NOW), false);
  assert.equal(isWithinPublishedWindow("2025-07-11T00:00:00.000Z", 30, NOW), false);
});

test("social window keeps items the tighter press window drops", () => {
  const twentyDaysAgo = "2026-05-12T00:00:00.000Z";
  assert.equal(isWithinPublishedWindow(twentyDaysAgo, 7, NOW), false);
  assert.equal(isWithinPublishedWindow(twentyDaysAgo, 30, NOW), true);
});

test("one day of grace at the window edge", () => {
  // Exactly 8 days back still passes a 7-day window thanks to the grace day.
  assert.equal(isWithinPublishedWindow("2026-05-24T00:00:00.000Z", 7, NOW), true);
});

test("classifies platform-native posts and video as social", () => {
  // These feed the "Social" source chip, kept distinct from web/press.
  assert.equal(isSocialSourceKind("social_post"), true);
  assert.equal(isSocialSourceKind("video"), true);
  assert.equal(isSocialSourceKind("VIDEO"), true);
  assert.equal(isSocialSourceKind(" social_post "), true);
});

test("classifies press/publication kinds as non-social", () => {
  for (const k of ["press_quote", "op_ed", "podcast", "interview", "publication", "news_article", "other"]) {
    assert.equal(isSocialSourceKind(k), false, `${k} should not be social`);
  }
});
