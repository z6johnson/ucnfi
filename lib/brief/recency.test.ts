import { test } from "node:test";
import assert from "node:assert/strict";

import { effectiveDateMs, isFresh, windowBounds } from "./recency.ts";

const END = new Date("2026-05-28T12:00:00Z");

test("windowBounds anchors to endDate and matches the manifest dates", () => {
  const w = windowBounds(END, 7);
  assert.equal(w.startIso, "2026-05-22");
  assert.equal(w.endIso, "2026-05-28");
  // inclusive start-of-day and end-of-day
  assert.equal(w.startMs, Date.parse("2026-05-22T00:00:00.000Z"));
  assert.equal(w.endMs, Date.parse("2026-05-28T23:59:59.999Z"));
});

test("effectiveDateMs prefers published_at, falls back to discovered_at, else null", () => {
  assert.equal(
    effectiveDateMs({ published_at: "2026-05-25", discovered_at: "2026-05-28T00:00:00Z" }),
    Date.parse("2026-05-25"),
  );
  assert.equal(
    effectiveDateMs({ published_at: null, discovered_at: "2026-05-28T00:00:00Z" }),
    Date.parse("2026-05-28T00:00:00Z"),
  );
  assert.equal(
    effectiveDateMs({ published_at: "not-a-date", discovered_at: "also-bad" }),
    null,
  );
});

test("in-window published_at is fresh", () => {
  const w = windowBounds(END, 7);
  assert.equal(isFresh({ published_at: "2026-05-25" }, w.startMs, w.endMs), true);
});

test("pre-window published_at is dropped (the W22 bug)", () => {
  const w = windowBounds(END, 7);
  assert.equal(isFresh({ published_at: "2025-07-12" }, w.startMs, w.endMs), false);
});

test("future published_at is dropped", () => {
  const w = windowBounds(END, 7);
  assert.equal(isFresh({ published_at: "2026-06-10" }, w.startMs, w.endMs), false);
});

test("null published_at with in-window discovered_at is fresh (fallback)", () => {
  const w = windowBounds(END, 7);
  assert.equal(
    isFresh({ published_at: null, discovered_at: "2026-05-27T08:00:00Z" }, w.startMs, w.endMs),
    true,
  );
});

test("null published_at with old discovered_at is dropped", () => {
  const w = windowBounds(END, 7);
  assert.equal(
    isFresh({ published_at: null, discovered_at: "2025-07-12T00:00:00Z" }, w.startMs, w.endMs),
    false,
  );
});

test("committee grace window admits a 20-day-old item the strict 7-day window rejects", () => {
  const item = { published_at: "2026-05-10" }; // 18 days before endDate
  const strict = windowBounds(END, 7);
  const grace = windowBounds(END, 30);
  assert.equal(isFresh(item, strict.startMs, strict.endMs), false);
  assert.equal(isFresh(item, grace.startMs, grace.endMs), true);
});
