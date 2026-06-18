import { test } from "node:test";
import assert from "node:assert/strict";

import { briefRecipients, renderBriefEmail } from "./email.ts";
import type { BriefEdition, BriefItem } from "./types.ts";

function makeItem(overrides: Partial<BriefItem> = {}): BriefItem {
  return {
    item_id: "item-1",
    priority: 1,
    headline: "Federal AI rule lands",
    what_happened: "A new rule was published.",
    why_it_matters: "UC must respond. See https://example.com/rule for detail.",
    for_the_committee: "Discuss at the next meeting.",
    feed_sources: [],
    baseline_anchors: [],
    peer_anchors: [],
    experts: [],
    ...overrides,
  };
}

function makeEdition(items: BriefItem[]): BriefEdition {
  return {
    edition_id: "2026-W23",
    week_ending: "2026-06-07",
    status: "published",
    reviewed_by: "",
    reviewed_at: "",
    generated_at: "2026-06-07T15:00:00Z",
    generated_by_model: "claude-sonnet-4-6",
    inputs_manifest: {
      external: { from: "", to: "", n: 0 },
      peer: { from: "", to: "", n: 0 },
      vendor: { from: "", to: "", n: 0 },
      web: { from: "", to: "", n: 0 },
      committee_signal_dates: [],
    },
    items,
  };
}

test("briefRecipients parses, trims, and dedupes chairs + support", () => {
  const prevChairs = process.env.BRIEF_TO_CHAIRS;
  const prevSupport = process.env.BRIEF_TO_SUPPORT;
  try {
    process.env.BRIEF_TO_CHAIRS = " a@x.edu, b@x.edu ; a@X.edu";
    process.env.BRIEF_TO_SUPPORT = "support@x.edu,, support@x.edu";
    const { chairs, support } = briefRecipients();
    assert.deepEqual(chairs, ["a@x.edu", "b@x.edu"]);
    assert.deepEqual(support, ["support@x.edu"]);
  } finally {
    restore("BRIEF_TO_CHAIRS", prevChairs);
    restore("BRIEF_TO_SUPPORT", prevSupport);
  }
});

test("briefRecipients returns empty arrays when unset", () => {
  const prevChairs = process.env.BRIEF_TO_CHAIRS;
  const prevSupport = process.env.BRIEF_TO_SUPPORT;
  try {
    delete process.env.BRIEF_TO_CHAIRS;
    delete process.env.BRIEF_TO_SUPPORT;
    const { chairs, support } = briefRecipients();
    assert.deepEqual(chairs, []);
    assert.deepEqual(support, []);
  } finally {
    restore("BRIEF_TO_CHAIRS", prevChairs);
    restore("BRIEF_TO_SUPPORT", prevSupport);
  }
});

test("renderBriefEmail includes edition id, headlines, section labels, and link", () => {
  const edition = makeEdition([
    makeItem(),
    makeItem({ item_id: "item-2", headline: "State budget shifts" }),
  ]);
  const { subject, html } = renderBriefEmail(edition);

  assert.ok(subject.includes("2026-W23"), "subject has edition id");
  assert.ok(subject.includes("2026-06-07"), "subject has week ending");

  assert.ok(html.includes("Federal AI rule lands"));
  assert.ok(html.includes("State budget shifts"));
  assert.ok(html.includes("What happened"));
  assert.ok(html.includes("Why it matters to UC"));
  assert.ok(html.includes("For the committee"));
  assert.ok(html.includes("/brief"), "links to the brief page");
  assert.ok(html.includes("https://example.com/rule"), "autolinks prose URLs");
});

test("renderBriefEmail escapes HTML in prose so markup can't leak", () => {
  const edition = makeEdition([
    makeItem({
      headline: "Tag <script> test",
      what_happened: "Beware <b>injected</b> & unescaped markup.",
    }),
  ]);
  const { html } = renderBriefEmail(edition);

  assert.ok(!html.includes("<script>"), "raw script tag must not appear");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;b&gt;injected&lt;/b&gt;"));
  assert.ok(html.includes("&amp;"));
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
