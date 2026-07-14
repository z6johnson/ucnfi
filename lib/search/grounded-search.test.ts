import { test } from "node:test";
import assert from "node:assert/strict";

import {
  type Citation,
  type FetchLike,
  anchorToCitations,
  dropDeadUrls,
  extractGroundingCitations,
  groundingTools,
  parseSearchItems,
  registrableDomain,
  resolveCitations,
  titleSimilarity,
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

/* ---- resolveCitations: grounding-redirect resolution ---- */

// Gemini returns citations as redirect links on vertexaisearch.cloud.google.com;
// the real source URL is only revealed by following the redirect.
const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect";

test("resolveCitations follows a grounding redirect to the real source URL", async () => {
  const cites: Citation[] = [{ url: `${REDIRECT}/AbC123`, title: "T" }];
  const fakeFetch: FetchLike = async (url) => ({
    status: 200,
    url: url.startsWith(REDIRECT) ? "https://today.ucsd.edu/story/real" : url,
  });
  const resolved = await resolveCitations(cites, fakeFetch);
  assert.equal(resolved[0].url, "https://today.ucsd.edu/story/real");
  assert.equal(resolved[0].title, "T");
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

/* ---- registrableDomain ---- */

test("registrableDomain reduces a host to its eTLD+1", () => {
  assert.equal(registrableDomain("today.ucsd.edu"), "ucsd.edu");
  assert.equal(registrableDomain("datax.ucla.edu"), "ucla.edu");
  assert.equal(registrableDomain("newsroom.ucla.edu"), "ucla.edu");
  assert.equal(registrableDomain("www.latimes.com"), "latimes.com");
  assert.equal(registrableDomain("example.com"), "example.com");
  assert.equal(registrableDomain("news.bbc.co.uk"), "bbc.co.uk");
});

/* ---- titleSimilarity ---- */

test("titleSimilarity scores distinctive-token containment, ignores filler", () => {
  assert.equal(
    titleSimilarity("UK Study Finds AI Refusers", "UK Study Finds AI Refusers Among Students"),
    1,
  );
  assert.equal(titleSimilarity("apple pie recipe", "banana bread loaf"), 0);
  // A single shared distinctive token is not enough.
  assert.equal(titleSimilarity("AI policy at UC", "AI"), 0);
});

/* ---- anchorToCitations: repair URLs from resolved citations ---- */

test("repairs a wrong-host guess via the shared registrable domain (titles differ)", () => {
  // The flagship case: the model stored ucsd.edu/newsroom/… with a paraphrased
  // title; the real article is on today.ucsd.edu. Titles barely overlap, but
  // the registrable domain (ucsd.edu) matches, so the citation URL is adopted.
  const items = [
    { url: "https://ucsd.edu/newsroom/press-release/how-uc-san-diego-is-leading-the-way-in-ai-education", title: "How UC San Diego is leading the way in AI education" },
  ];
  const cites: Citation[] = [
    { url: "https://today.ucsd.edu/story/faculty-symposium-highlights-ais-strengths-in-higher-ed-teaching", title: "Faculty Symposium Highlights AI's Strengths in Higher Ed Teaching" },
  ];
  const out = anchorToCitations(items, cites, () => {});
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://today.ucsd.edu/story/faculty-symposium-highlights-ais-strengths-in-higher-ed-teaching");
});

test("picks the best same-domain citation by title overlap", () => {
  const items = [
    { url: "https://newsroom.ucla.edu/bulletin-board/ucla-awarded-300000", title: "UCLA Awarded $300,000 State Grant to Launch Public Interest Technology" },
  ];
  const cites: Citation[] = [
    { url: "https://newsroom.ucla.edu/unrelated", title: "Some Unrelated UCLA Story About Campus Robotics" },
    { url: "https://datax.ucla.edu/news-events/news/ucla-awarded-300000-state-grant-launch-public-interest-technology-pathways", title: "UCLA Awarded $300,000 State Grant to Launch Public Interest Technology Pathways" },
  ];
  const out = anchorToCitations(items, cites, () => {});
  assert.equal(out[0].url, "https://datax.ucla.edu/news-events/news/ucla-awarded-300000-state-grant-launch-public-interest-technology-pathways");
});

test("adopts a strong cross-domain title match", () => {
  const items = [
    { url: "https://guessed-aggregator.example/x", title: "UK Study Finds Evidence of Conscientious Objectors and AI Refusers" },
  ];
  const cites: Citation[] = [
    { url: "https://www.timeshighereducation.com/news/third-students-shun-generative-ai", title: "UK Study Finds Evidence of Conscientious Objectors and AI Refusers Among Students" },
  ];
  const out = anchorToCitations(items, cites, () => {});
  assert.equal(out[0].url, "https://www.timeshighereducation.com/news/third-students-shun-generative-ai");
});

test("fails open (keeps items unchanged) when there are no citations", () => {
  const items = [{ url: "https://a.com/x", title: "T" }];
  let warned = "";
  const out = anchorToCitations(items, [], (m) => (warned = m));
  assert.deepEqual(out, items);
  assert.match(warned, /no grounding citations/);
});

test("drops an ungroundable item even when its own URL is live", () => {
  // The iheart.com regression: a fabricated URL that isn't a hard 404 must
  // still be dropped when no grounding citation backs it — being "live" is
  // not grounding.
  const items = [
    { url: "https://www.iheart.com/content/brown-ai-cheating-scandal", title: "Brown University Professor Criticizes AI Cheating Response" },
    { url: "https://today.ucsd.edu/story/real", title: "Faculty Symposium Highlights AI Strengths" },
  ];
  const cites: Citation[] = [
    { url: "https://today.ucsd.edu/story/real", title: "Faculty Symposium Highlights AI Strengths" },
  ];
  const out = anchorToCitations(items, cites, () => {});
  assert.deepEqual(out.map((i) => i.url), ["https://today.ucsd.edu/story/real"]);
});
