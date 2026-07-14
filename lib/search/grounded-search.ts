/**
 * Grounded web search over the UCSD TritonAI LiteLLM proxy, using a
 * Google-Search-grounded Gemini model (default `gemini-3.5-flash`) via the
 * OpenAI-compatible `/v1/chat/completions` endpoint.
 *
 * Replaces the retired `internet_tool` MCP path. The TritonAI gateway
 * stopped advertising that MCP server (tools/list returns an empty list),
 * so tier-2 went silent in mid-June. We enable grounding explicitly by
 * passing Gemini's `googleSearch` tool (a plain chat call answers from
 * training data — no search, no citations); Gemini then does the searching
 * server-side in a single completion — no client-driven tool loop. We send
 * the same "return strict JSON" prompt, read the model's answer, and take
 * each item's backing from the response's grounding citations. Corroborating
 * item URLs against those citations keeps a hallucinated URL from reaching
 * the ledger.
 *
 * Transport is hand-rolled `fetch` (no OpenAI SDK dependency): the scan runs
 * under `node --experimental-strip-types` with `npm ci`, and all we need is
 * one POST.
 *
 * This module also hosts the shared response-parsing and date helpers the
 * committee scan (lib/scan/websearch.ts) and the weekly Brief
 * (lib/brief/sources/web.ts) use to turn the model's JSON answer into items.
 *
 * No "server-only" import: callers run under --experimental-strip-types in
 * Node CLI scripts, not just Next.js.
 */

import { canonicalUrl } from "../activity.ts";
import { LITELLM_BASE_URL } from "../litellm.ts";

/* ------------------------------------------------------------------ */
/* Model + endpoint                                                    */
/* ------------------------------------------------------------------ */

// `||` (not `??`) so an empty-string env var — what GitHub Actions produces
// from an unset `vars.X` interpolation — falls back to the default.
export const SEARCH_MODEL = process.env.SEARCH_MODEL || "gemini-3.5-flash";

/** OpenAI-compatible chat endpoint on the LiteLLM proxy. Override with
 *  `LITELLM_OPENAI_URL` if the gateway serves it at a different path. */
function chatEndpoint(): string {
  return (
    process.env.LITELLM_OPENAI_URL ||
    `${LITELLM_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`
  );
}

function authToken(): string {
  const key = process.env.LITELLM_API_KEY;
  if (!key) throw new Error("LITELLM_API_KEY is not set.");
  return key;
}

/**
 * Google Search grounding must be requested explicitly: without a search
 * tool in the request, Gemini answers from training data — no live search,
 * no citations (the failure we saw shipping the plain chat call). LiteLLM
 * maps the native `{ googleSearch: {} }` tool to Gemini's grounding on the
 * underlying generateContent request.
 *
 * The accepted tool shape varies across LiteLLM versions (some want
 * `{ web_search: {} }` or a typed entry), so allow an override via
 * `SEARCH_GROUNDING_TOOLS_JSON` (a raw JSON array). Set it to `[]` to send
 * no tool. Do NOT combine with `response_format`: on Gemini-3 that combo
 * makes LiteLLM emit raw tool-call tokens instead of the JSON answer, which
 * is why we ask for JSON in the prompt rather than via a schema param.
 */
export function groundingTools(): unknown[] {
  const raw = process.env.SEARCH_GROUNDING_TOOLS_JSON;
  if (raw && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v;
      console.warn("[search] SEARCH_GROUNDING_TOOLS_JSON is not a JSON array; using default");
    } catch {
      console.warn("[search] SEARCH_GROUNDING_TOOLS_JSON is not valid JSON; using default");
    }
  }
  return [{ googleSearch: {} }];
}

/* ------------------------------------------------------------------ */
/* Date pinning                                                        */
/* ------------------------------------------------------------------ */

/**
 * The model otherwise infers "now" from whatever dates show up in search
 * results and routinely gets it wrong (we saw it decide it was "late July
 * 2025"), which wrecks the lookback window. Pin the real date and the cutoff.
 */
export function dateContextLine(lookbackDays: number): string {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  return `Today's date is ${today} (UTC). "The past ${lookbackDays} day(s)" means published on or after ${start}; judge recency by this date, not by guessing from search results.`;
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                    */
/* ------------------------------------------------------------------ */

export type RawWebItem = {
  title?: unknown;
  url?: unknown;
  published_at?: unknown;
  snippet?: unknown;
  source_kind?: unknown;
  match_reason?: unknown;
};

export function tryParseJsonBlock(text: string): { items?: RawWebItem[] } | null {
  // Strip an accidental code fence if the model produced one despite instructions.
  let s = text.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) s = fenceMatch[1].trim();
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object") return v as { items?: RawWebItem[] };
  } catch {
    // Fall through.
  }
  // Last resort: find the first { ... } substring and try.
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const v = JSON.parse(s.slice(start, end + 1));
      if (v && typeof v === "object") return v as { items?: RawWebItem[] };
    } catch {
      // Give up.
    }
  }
  return null;
}

export function parseSearchItems(
  text: string,
  logTag: string,
  logPrefix = "[scan]",
): RawWebItem[] {
  if (!text) {
    console.warn(`${logPrefix} grounded-search empty response ${logTag}`);
    return [];
  }
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    console.warn(`${logPrefix} grounded-search unparseable response ${logTag}: ${text.slice(0, 200)}`);
    return [];
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}

/* ------------------------------------------------------------------ */
/* Grounding citations                                                 */
/* ------------------------------------------------------------------ */

export type Citation = { url: string; title?: string };

function host(u: string): string {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Pull the grounded source URLs out of a chat/completions response.
 *
 * LiteLLM surfaces provider grounding metadata in more than one shape
 * depending on model and version, so we look in every documented spot and
 * fall back to a bounded deep scan:
 *   - OpenAI-style `message.annotations[]` of type `url_citation`
 *   - Gemini/Vertex `grounding_metadata.groundingChunks[].web.uri`
 *     (camelCase and snake_case, at message / choice / top level)
 *   - any remaining `{ web: { uri | url } }` or `url_citation` objects
 * Deduped by canonical URL. Non-http(s) entries are dropped.
 */
export function extractGroundingCitations(response: unknown): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();

  const add = (url: unknown, title?: unknown): void => {
    if (typeof url !== "string") return;
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return;
    const key = canonicalUrl(u);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: u, ...(typeof title === "string" && title ? { title } : {}) });
  };

  // Bounded recursive walk over the known citation shapes.
  const visit = (node: unknown, depth: number): void => {
    if (node === null || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) {
      for (const el of node) visit(el, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;

    // OpenAI url_citation annotation: { type: "url_citation", url_citation: { url, title } }
    // or the flattened { type: "url_citation", url, title }.
    if (obj.type === "url_citation") {
      const uc = obj.url_citation as Record<string, unknown> | undefined;
      if (uc) add(uc.url, uc.title);
      else add(obj.url, obj.title);
    }

    // Gemini/Vertex grounding chunk: { web: { uri | url, title } }.
    const web = obj.web as Record<string, unknown> | undefined;
    if (web && typeof web === "object") add(web.uri ?? web.url, web.title);

    for (const v of Object.values(obj)) visit(v, depth + 1);
  };

  visit(response, 0);
  return out;
}

/**
 * Keep only items whose URL is backed by a grounding citation, so a URL the
 * model invented can't enter the ledger. Matches on canonical URL first,
 * then falls back to a same-host match (a citation and the model's canonical
 * link to the same article can differ in tracking params).
 *
 * Fails OPEN at the set level to avoid silently regressing to zero results
 * the way the dead MCP path did: if the response carried no citations, or
 * carried citations that matched none of the items (a sign the gateway
 * returns citation URLs in an unexpected form, e.g. redirect links), keep
 * the items unverified and warn loudly instead of dropping everything.
 */
export function corroborateWithCitations<T extends { url: string }>(
  items: T[],
  citations: Citation[],
  warn: (msg: string) => void,
): T[] {
  if (items.length === 0) return items;
  if (citations.length === 0) {
    warn(`no grounding citations in response — keeping ${items.length} item(s) unverified`);
    return items;
  }
  const canon = new Set(citations.map((c) => canonicalUrl(c.url)));
  const hosts = new Set(citations.map((c) => host(c.url)).filter(Boolean));
  const kept = items.filter((it) => {
    if (canon.has(canonicalUrl(it.url))) return true;
    const h = host(it.url);
    return h !== "" && hosts.has(h);
  });
  if (kept.length === 0) {
    warn(
      `${citations.length} citation(s) matched none of ${items.length} item URL(s) — keeping unverified (citation URL form may differ)`,
    );
    return items;
  }
  if (kept.length < items.length) {
    warn(`dropped ${items.length - kept.length} item(s) not backed by a grounding citation`);
  }
  return kept;
}

/* ------------------------------------------------------------------ */
/* Citation resolution + URL liveness                                  */
/* ------------------------------------------------------------------ */
/* The model reliably fabricates the `url` field — it knows an article's
 * content from live grounding but guesses the URL from the site's URL
 * pattern, so many links 404. corroborateWithCitations above is meant to
 * drop those, but Gemini's grounding citations arrive as redirect links on
 * `vertexaisearch.cloud.google.com` whose host never matches the real
 * article host, so the guard always fails open. These two helpers close the
 * gap: resolveCitations recovers the real source URLs (so corroboration can
 * filter wrong-host guesses), and dropDeadUrls fetches each surviving link
 * and drops the ones that are definitively gone (so a wrong-path guess on a
 * legitimate host can't slip through either). */

/** Google returns grounding citations as redirect links on this host; the
 *  real source URL is only revealed by following the redirect. */
const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

const LIVENESS_TIMEOUT_MS = 10_000;
/** A browser-like UA: some outlets 403 an obviously-automated agent, and a
 *  spurious 403 would otherwise read as "alive but blocked" noise. */
const LIVENESS_USER_AGENT =
  "Mozilla/5.0 (compatible; ucnfi-link-check/0.1; +https://github.com/z6johnson/ucnfi)";

/** HTTP statuses we treat as a definitively dead link. Everything else —
 *  2xx/3xx and the ambiguous 401/403/405/429/5xx plus network/timeout
 *  errors — is kept, so bot-blocked or transient-error pages (valid links)
 *  are never falsely dropped. */
const DEAD_STATUSES = new Set([404, 410]);

/** Minimal Response surface the probe needs. `fetch`'s Response satisfies it
 *  structurally; tests inject a fake to exercise status handling offline. */
type ProbeResponse = { status: number; url?: string };
export type FetchLike = (url: string, init: RequestInit) => Promise<ProbeResponse>;

const defaultFetch: FetchLike = (url, init) => fetch(url, init);

/**
 * GET a URL following redirects, with a bounded timeout and a browser-like
 * UA. Returns the final status and resolved URL, or null on any transport
 * error (timeout, DNS, connection reset). Never throws.
 */
async function probeUrl(
  url: string,
  doFetch: FetchLike,
): Promise<{ status: number; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), LIVENESS_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": LIVENESS_USER_AGENT, Accept: "*/*" },
      signal: ctrl.signal,
    });
    return { status: res.status, finalUrl: typeof res.url === "string" && res.url ? res.url : url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Replace `vertexaisearch.cloud.google.com` grounding-redirect citation URLs
 * with the real source URL they redirect to, so corroborateWithCitations can
 * match items on the true host. Non-redirect citations pass through
 * unchanged; a citation whose redirect can't be resolved keeps its original
 * URL (fail-open, never throws). Resolved in parallel — citation counts are
 * small (≤ ~20).
 */
export async function resolveCitations(
  citations: Citation[],
  doFetch: FetchLike = defaultFetch,
): Promise<Citation[]> {
  return Promise.all(
    citations.map(async (c) => {
      if (host(c.url) !== GROUNDING_REDIRECT_HOST) return c;
      const probed = await probeUrl(c.url, doFetch);
      const final = probed?.finalUrl;
      if (final && /^https?:\/\//i.test(final) && host(final) !== GROUNDING_REDIRECT_HOST) {
        return { ...c, url: final };
      }
      return c;
    }),
  );
}

/**
 * Fetch each item's URL and drop the ones that are definitively dead
 * (HTTP 404/410). Everything else is kept — see DEAD_STATUSES. Runs the
 * checks in parallel and warns on each drop.
 *
 * Known limitation: soft-404s that answer 200 with a "not found" body
 * (e.g. YouTube "video unavailable") aren't caught by status alone; those
 * are handled upstream by resolveCitations + corroborateWithCitations
 * dropping the wrong-host guess.
 */
export async function dropDeadUrls<T extends { url: string }>(
  items: T[],
  warn: (msg: string) => void,
  doFetch: FetchLike = defaultFetch,
): Promise<T[]> {
  if (items.length === 0) return items;
  const verdicts = await Promise.all(
    items.map(async (it) => {
      const probed = await probeUrl(it.url, doFetch);
      const deadStatus = probed && DEAD_STATUSES.has(probed.status) ? probed.status : null;
      return { it, deadStatus };
    }),
  );
  const kept: T[] = [];
  for (const { it, deadStatus } of verdicts) {
    if (deadStatus !== null) warn(`dropped dead link (HTTP ${deadStatus}) ${it.url}`);
    else kept.push(it);
  }
  return kept;
}

/* ------------------------------------------------------------------ */
/* The grounded call                                                   */
/* ------------------------------------------------------------------ */

export type GroundedResult = {
  /** The model's final text — expected to be the strict JSON items object. */
  text: string;
  /** Grounded source URLs pulled from the response metadata. */
  citations: Citation[];
  /** finish_reason, for the run summary. */
  stop: string;
};

export type RunGroundedSearchArgs = {
  systemPrompt: string;
  userPrompt: string;
  /** Log tag for the summary/warn lines, e.g. a member id or "web". */
  logTag: string;
  /** Model id. Defaults to SEARCH_MODEL (gemini-3.5-flash). */
  model?: string;
  /**
   * Output token ceiling. Default 2048 is plenty for a handful of items; the
   * broad topic pass raises this so its longer list isn't truncated (a
   * truncated JSON answer is unparseable → 0 items).
   */
  maxTokens?: number;
  /** Log prefix, e.g. "[scan]" or "[brief]". */
  logPrefix?: string;
};

/**
 * Run one grounded completion and return the model's answer plus the
 * grounding citations. Returns `null` on transport/HTTP failure so the
 * caller skips rather than letting the model invent URLs with no backing.
 */
export async function runGroundedSearch(
  args: RunGroundedSearchArgs,
): Promise<GroundedResult | null> {
  const logPrefix = args.logPrefix ?? "[scan]";
  const model = args.model || SEARCH_MODEL;
  const maxTokens = args.maxTokens ?? 2048;
  const tools = groundingTools();

  let res: Response;
  try {
    res = await fetch(chatEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${authToken()}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
        // Turn on live web search; without this Gemini answers from memory.
        ...(tools.length > 0 ? { tools } : {}),
      }),
    });
  } catch (err) {
    console.warn(`${logPrefix} grounded-search request failed ${args.logTag} err=${(err as Error).message}`);
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`${logPrefix} grounded-search HTTP ${res.status} ${args.logTag} ${body.slice(0, 200)}`);
    return null;
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    console.warn(`${logPrefix} grounded-search non-JSON body ${args.logTag}`);
    return null;
  }

  const choice = (data as { choices?: Array<Record<string, unknown>> })?.choices?.[0];
  const message = choice?.message as { content?: unknown } | undefined;
  let text = "";
  if (typeof message?.content === "string") {
    text = message.content;
  } else if (Array.isArray(message?.content)) {
    // Some gateways return content as an array of parts.
    text = message.content
      .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join("");
  }
  const stop = (choice?.finish_reason as string) ?? "?";
  const citations = extractGroundingCitations(data);
  return { text: text.trim(), citations, stop };
}
