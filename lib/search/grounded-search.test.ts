import { test } from "node:test";
import assert from "node:assert/strict";

import {
  type Citation,
  type FetchLike,
  corroborateWithCitations,
  dropDeadUrls,
  extractGroundingCitations,
  groundingTools,
  parseSearchItems,
  resolveCitations,
  tryParseJsonBlock,
} from "./grounded-search.ts";

/* ---- groundingTools: default + override ---- */

test("groundingTools defaults to the native Gemini googleSearch tool", () => {
  delete process.env.SEARCH_GROUNDING_TOOLS_JSON;
  assert.deepEqual(groundingTools(), [{ googleSearch: {} }]);
});

test("groundingTools honors a valid JSON-array override", () => {
  process.env.SEARCH_GROUNDING_TOOLS_JSON = '[{"web_search":{}}]';
  assert.deepEqual(groundingTools(), [{ web_search: {} }]);
  delete process.env.SEARCH_GROUNDING_TOOLS_JSON;
});

test("groundingTools can be emptied to send no tool", () => {
  process.env.SEARCH_GROUNDING_TOOLS_JSON = "[]";
  assert.deepEqual(groundingTools(), []);
  delete process.env.SEARCH_GROUNDING_TOOLS_JSON;
});

test("groundingTools falls back to default on invalid JSON", () => {
  process.env.SEARCH_GROUNDING_TOOLS_JSON = "not json";
  assert.deepEqual(groundingTools(), [{ googleSearch: {} }]);
  delete process.env.SEARCH_GROUNDING_TOOLS_JSON;
});

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

/* ---- corroboration against realistic grounding-redirect citations ---- */

// The regression that motivated the fix: Gemini returns citations as redirect
// links on vertexaisearch.cloud.google.com, whose host never matches the
// model's guessed article host, so corroboration always failed open and kept
// fabricated URLs. Older fixtures used same-host citation URLs and missed it.
const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect";

test("raw redirect citations match no items and corroboration fails open", () => {
  const items = [{ url: "https://ucsd.edu/newsroom/fabricated-slug" }];
  const cites: Citation[] = [{ url: `${REDIRECT}/AbC123` }];
  let warned = "";
  const out = corroborateWithCitations(items, cites, (m) => (warned = m));
  // Nothing is dropped — the guard can't tell the guess from a real link
  // until the redirect is resolved to its true host.
  assert.deepEqual(out, items);
  assert.match(warned, /matched none/);
});

test("resolved redirect citations let corroboration drop wrong-host guesses", async () => {
  const items = [
    { url: "https://ucsd.edu/newsroom/fabricated-slug" }, // guessed host, no citation
    { url: "https://today.ucsd.edu/story/real" }, // real host, backed by a citation
  ];
  const cites: Citation[] = [{ url: `${REDIRECT}/AbC123` }];
  // The redirect resolves to today.ucsd.edu — a different host than the guess.
  const fakeFetch: FetchLike = async (url) => ({
    status: 200,
    url: url.startsWith(REDIRECT) ? "https://today.ucsd.edu/story/real" : url,
  });
  const resolved = await resolveCitations(cites, fakeFetch);
  assert.equal(resolved[0].url, "https://today.ucsd.edu/story/real");
  const out = corroborateWithCitations(items, resolved, () => {});
  assert.deepEqual(out, [{ url: "https://today.ucsd.edu/story/real" }]);
});

test("resolveCitations leaves non-redirect citations untouched", async () => {
  const cites: Citation[] = [{ url: "https://example.com/a", title: "A" }];
  const fakeFetch: FetchLike = async () => {
    throw new Error("must not fetch a non-redirect citation");
  };
  assert.deepEqual(await resolveCitations(cites, fakeFetch), cites);
});

test("resolveCitations keeps original URL when the redirect can't resolve", async () => {
  const cites: Citation[] = [{ url: `${REDIRECT}/AbC123` }];
  const fakeFetch: FetchLike = async () => {
    throw new Error("network down");
  };
  assert.deepEqual(await resolveCitations(cites, fakeFetch), cites);
});

/* ---- dropDeadUrls: status classification via injected fetcher ---- */

test("dropDeadUrls drops only definitive 404/410, keeps everything else", async () => {
  const items = [
    { url: "https://s/200" },
    { url: "https://s/301" },
    { url: "https://s/403" },
    { url: "https://s/404" },
    { url: "https://s/410" },
    { url: "https://s/429" },
    { url: "https://s/500" },
    { url: "https://s/throws" },
  ];
  const fakeFetch: FetchLike = async (url) => {
    if (url.endsWith("/throws")) throw new Error("connection reset");
    const status = Number(url.slice(url.lastIndexOf("/") + 1));
    return { status, url };
  };
  const dropped: string[] = [];
  const kept = await dropDeadUrls(items, (m) => dropped.push(m), fakeFetch);
  assert.deepEqual(
    kept.map((i) => i.url),
    [
      "https://s/200",
      "https://s/301",
      "https://s/403",
      "https://s/429",
      "https://s/500",
      "https://s/throws",
    ],
  );
  assert.equal(dropped.length, 2);
  assert.match(dropped[0], /HTTP 404/);
});

test("dropDeadUrls returns the input untouched when empty", async () => {
  const fakeFetch: FetchLike = async () => {
    throw new Error("must not fetch");
  };
  assert.deepEqual(await dropDeadUrls([], () => {}, fakeFetch), []);
});
