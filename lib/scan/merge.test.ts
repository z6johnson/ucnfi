import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeItemLines, mergeSeenLedgers } from "./merge.ts";

test("mergeSeenLedgers unions disjoint ids", () => {
  const merged = mergeSeenLedgers(
    { a: "2026-05-01T00:00:00.000Z" },
    { b: "2026-05-02T00:00:00.000Z" },
  );
  assert.deepEqual(merged, {
    a: "2026-05-01T00:00:00.000Z",
    b: "2026-05-02T00:00:00.000Z",
  });
});

test("mergeSeenLedgers keeps the earlier first-seen timestamp on collision", () => {
  const early = "2026-05-01T09:00:00.000Z";
  const late = "2026-05-01T18:00:00.000Z";
  assert.equal(mergeSeenLedgers({ a: late }, { a: early }).a, early);
  assert.equal(mergeSeenLedgers({ a: early }, { a: late }).a, early);
});

test("mergeSeenLedgers does not mutate its inputs", () => {
  const ours = { a: "2026-05-01T00:00:00.000Z" };
  const theirs = { b: "2026-05-02T00:00:00.000Z" };
  mergeSeenLedgers(ours, theirs);
  assert.deepEqual(ours, { a: "2026-05-01T00:00:00.000Z" });
  assert.deepEqual(theirs, { b: "2026-05-02T00:00:00.000Z" });
});

function line(id: string, title = "t"): string {
  return JSON.stringify({ id, member_id: "m", title, url: `https://x/${id}` });
}

test("mergeItemLines unions and dedupes by id, ours first", () => {
  const ours = line("1") + "\n" + line("2") + "\n";
  const theirs = line("2") + "\n" + line("3") + "\n";
  const merged = mergeItemLines(ours, theirs);
  assert.equal(merged, [line("1"), line("2"), line("3")].join("\n") + "\n");
});

test("mergeItemLines dedupe by id ignores differing bodies, keeping ours", () => {
  const ours = line("1", "ours-title") + "\n";
  const theirs = line("1", "theirs-title") + "\n";
  const merged = mergeItemLines(ours, theirs);
  assert.equal(merged, line("1", "ours-title") + "\n");
});

test("mergeItemLines handles one empty side (add/add against nothing)", () => {
  const theirs = line("1") + "\n" + line("2") + "\n";
  assert.equal(mergeItemLines("", theirs), theirs);
  assert.equal(mergeItemLines(theirs, ""), theirs);
});

test("mergeItemLines returns empty string for two empty sides", () => {
  assert.equal(mergeItemLines("", ""), "");
  assert.equal(mergeItemLines("\n\n", ""), "");
});

test("mergeItemLines keeps distinct unparseable lines but collapses identical ones", () => {
  const merged = mergeItemLines("not json\n", "not json\nother junk\n");
  assert.equal(merged, "not json\nother junk\n");
});
