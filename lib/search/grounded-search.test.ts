import { test } from "node:test";
import assert from "node:assert/strict";

import {
  type Citation,
  corroborateWithCitations,
  extractGroundingCitations,
  parseSearchItems,
  tryParseJsonBlock,
} from "./grounded-search.ts";

/* ---- extractGroundingCitations: multiple response shapes ---- */

test("extracts OpenAI url_citation annotations (nested url_citation)", () => {
  const resp = {
    choices: [
      {
        message: {
          content: "{}",
          annotations: [
            { type: "url_citation", url_citation: { url: "https://a.com/x", title: "A" } },
            { type: "url_citation", url_citation: { url: "https://b.com/y" } },
          ],
        },
      },
    ],
  };
  const cites = extractGroundingCitations(resp);
  assert.deepEqual(
    cites.map((c) => c.url),
    ["https://a.com/x", "https://b.com/y"],
  );
  assert.equal(cites[0].title, "A");
});

test("extracts OpenAI url_citation annotations (flattened)", () => {
  const resp = {
    choices: [{ message: { annotations: [{ type: "url_citation", url: "https://c.com/z", title: "C" }] } }],
  };
  assert.deepEqual(extractGroundingCitations(resp).map((c) => c.url), ["https://c.com/z"]);
});

test("extracts Gemini groundingChunks web.uri (camelCase and snake_case)", () => {
  const camel = {
    choices: [
      { message: { grounding_metadata: { groundingChunks: [{ web: { uri: "https://g.com/1", title: "G1" } }] } } },
    ],
  };
  const snake = {
    vertex_ai_grounding_metadata: { grounding_chunks: [{ web: { url: "https://g.com/2", title: "G2" } }] },
  };
  assert.deepEqual(extractGroundingCitations(camel).map((c) => c.url), ["https://g.com/1"]);
  assert.deepEqual(extractGroundingCitations(snake).map((c) => c.url), ["https://g.com/2"]);
});

test("dedupes citations by canonical URL and drops non-http", () => {
  const resp = {
    a: { web: { uri: "https://x.com/p?utm_source=news" } },
    b: { web: { uri: "https://x.com/p" } },
    c: { web: { uri: "mailto:nope@x.com" } },
  };
  assert.deepEqual(extractGroundingCitations(resp).map((c) => c.url), ["https://x.com/p?utm_source=news"]);
});

test("returns no citations when none present", () => {
  assert.deepEqual(extractGroundingCitations({ choices: [{ message: { content: "{}" } }] }), []);
});

/* ---- corroborateWithCitations: filtering + fail-open ---- */

const warnSink = () => {};

test("keeps items whose URL exactly matches a citation", () => {
  const items = [{ url: "https://a.com/x" }, { url: "https://z.com/bad" }];
  const cites: Citation[] = [{ url: "https://a.com/x" }];
  assert.deepEqual(corroborateWithCitations(items, cites, warnSink), [{ url: "https://a.com/x" }]);
});

test("keeps items matched by host when the exact URL differs", () => {
  const items = [{ url: "https://a.com/article?ref=x" }];
  const cites: Citation[] = [{ url: "https://a.com/some-other-path" }];
  assert.deepEqual(corroborateWithCitations(items, cites, warnSink), items);
});

test("fails open when there are no citations", () => {
  const items = [{ url: "https://a.com/x" }, { url: "https://b.com/y" }];
  let warned = "";
  const out = corroborateWithCitations(items, [], (m) => (warned = m));
  assert.deepEqual(out, items);
  assert.match(warned, /no grounding citations/);
});

test("fails open when citations match none of the items", () => {
  const items = [{ url: "https://a.com/x" }];
  const cites: Citation[] = [{ url: "https://redirect.example/xyz" }];
  let warned = "";
  const out = corroborateWithCitations(items, cites, (m) => (warned = m));
  assert.deepEqual(out, items);
  assert.match(warned, /matched none/);
});

test("drops only the uncorroborated items when some match", () => {
  const items = [{ url: "https://a.com/x" }, { url: "https://hallucinated.test/q" }];
  const cites: Citation[] = [{ url: "https://a.com/x" }];
  let warned = "";
  const out = corroborateWithCitations(items, cites, (m) => (warned = m));
  assert.deepEqual(out, [{ url: "https://a.com/x" }]);
  assert.match(warned, /dropped 1 item/);
});

/* ---- response parsing helpers ---- */

test("tryParseJsonBlock strips code fences", () => {
  assert.deepEqual(tryParseJsonBlock('```json\n{"items":[]}\n```'), { items: [] });
});

test("parseSearchItems returns items array from a plain JSON answer", () => {
  const items = parseSearchItems('{"items":[{"url":"https://a.com","title":"t"}]}', "tag");
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://a.com");
});

test("parseSearchItems returns [] on unparseable text", () => {
  assert.deepEqual(parseSearchItems("not json at all", "tag"), []);
});
