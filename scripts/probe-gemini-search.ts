/**
 * One-shot probe for the grounded tier-2 search backend.
 *
 * Sends a single grounded query to the OpenAI-compatible chat endpoint on
 * the TritonAI LiteLLM proxy and prints (1) the model's text answer, (2) the
 * citations our extractor pulls from the response, and (3) the raw response
 * JSON. Use it to confirm the gateway, key, model id, and — importantly —
 * the exact shape of the grounding metadata, so lib/search/grounded-search.ts
 * `extractGroundingCitations` can be tightened if the live shape differs from
 * the ones it already handles.
 *
 * Usage:
 *   LITELLM_API_KEY=... npm run probe:search
 *   LITELLM_API_KEY=... SEARCH_MODEL=gemini-3.5-flash \
 *     LITELLM_BASE_URL=https://tritonai-api.ucsd.edu npm run probe:search
 *   ... PROBE_QUERY="one recent UC AI policy story" npm run probe:search
 *
 * Prints the raw JSON last so nothing important scrolls off; pass
 * PROBE_RAW=0 to suppress it.
 */

import { LITELLM_BASE_URL } from "../lib/litellm.ts";
import { SEARCH_MODEL, extractGroundingCitations, groundingTools } from "../lib/search/grounded-search.ts";

const endpoint =
  process.env.LITELLM_OPENAI_URL || `${LITELLM_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`;
const query =
  process.env.PROBE_QUERY ||
  "Find one recent news article (last 14 days) about University of California AI policy. Reply with the title and URL.";

async function main(): Promise<void> {
  const key = process.env.LITELLM_API_KEY;
  if (!key) {
    console.error("LITELLM_API_KEY is not set.");
    process.exit(2);
  }
  const tools = groundingTools();
  console.info(`[probe] endpoint=${endpoint} model=${SEARCH_MODEL}`);
  console.info(`[probe] grounding tools=${JSON.stringify(tools)}`);
  console.info(`[probe] query=${JSON.stringify(query)}`);

  const started = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [
        { role: "system", content: "Ground every answer in live web search results, not prior knowledge." },
        { role: "user", content: query },
      ],
      ...(tools.length > 0 ? { tools } : {}),
    }),
  });
  console.info(`[probe] HTTP ${res.status} in ${Date.now() - started}ms`);

  const bodyText = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    console.error("[probe] response was not JSON:\n", bodyText.slice(0, 2000));
    process.exit(1);
  }

  const choice = (data as { choices?: Array<Record<string, unknown>> }).choices?.[0];
  const content = (choice?.message as { content?: unknown })?.content;
  console.info("\n[probe] --- model text ---");
  console.info(typeof content === "string" ? content : JSON.stringify(content));

  const citations = extractGroundingCitations(data);
  console.info(`\n[probe] --- extracted citations (${citations.length}) ---`);
  for (const c of citations) console.info(`  ${c.url}${c.title ? `  (${c.title})` : ""}`);
  if (citations.length === 0) {
    console.warn(
      "[probe] No citations extracted. If the model text cites sources, the grounding\n" +
        "        metadata is in a shape extractGroundingCitations doesn't handle yet —\n" +
        "        inspect the raw JSON below and extend the extractor.",
    );
  }

  if (process.env.PROBE_RAW !== "0") {
    console.info("\n[probe] --- raw response JSON ---");
    console.info(JSON.stringify(data, null, 2));
  }
}

main().catch((err) => {
  console.error("[probe] fatal:", err);
  process.exit(1);
});
