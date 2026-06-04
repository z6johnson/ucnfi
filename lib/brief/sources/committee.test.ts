import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendItems, isoDateUTC, type ActivityItem } from "../../activity.ts";
import { collectCommitteeSignal } from "./committee.ts";

const END = new Date("2026-05-28T12:00:00Z");
const PUBLISHED = "2026-05-25T00:00:00.000Z"; // inside the grace window

function makeItem(
  memberId: string,
  scope: ActivityItem["scope"],
  url: string,
): ActivityItem {
  return {
    id: url,
    member_id: memberId,
    scope,
    tier: 2,
    source_kind: "websearch",
    title: `item for ${scope}`,
    url,
    published_at: PUBLISHED,
    snippet: "",
    match_reason: "websearch (news_article)",
    discovered_at: "2026-05-28T00:00:00.000Z",
  };
}

test("topic items are included as field_news and other scopes keep their subkind", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "ucnfi-brief-"));
  const today = isoDateUTC(END);
  appendItems(repoRoot, today, [
    makeItem("goldberg-k", "member", "https://example.com/member"),
    makeItem("committee", "committee", "https://example.com/committee"),
    makeItem("topic", "topic", "https://example.com/topic"),
  ]);

  const { items } = collectCommitteeSignal({
    repoRoot,
    endDate: END,
    windowDays: 7,
    graceDays: 30,
  });

  const bySubkind = new Map(items.map((i) => [i.subkind, i]));
  assert.equal(items.length, 3, `expected all three scopes, got ${items.length}`);
  assert.ok(bySubkind.has("member"), "member item should pass through");
  assert.ok(bySubkind.has("committee_body"), "committee item should pass through");
  assert.ok(bySubkind.has("field_news"), "topic item should be included as field_news");
  assert.equal(bySubkind.get("field_news")?.member_id, "topic");
});
