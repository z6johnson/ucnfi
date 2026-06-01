/**
 * Minimal MCP (Model Context Protocol) Streamable-HTTP client for the
 * TritonAI LiteLLM `internet_tool` search/retrieve server.
 *
 * Why this exists: the TritonAI gateway does NOT execute Anthropic's
 * server-side `web_search` tool — the model just emits a client-style
 * tool_use and stops, so tier-2 returned nothing (see scan logs:
 * `searches=0 stop=tool_use`). LiteLLM instead exposes web access as an
 * MCP server ("Search/Retrieve from the internet"). We drive that tool
 * ourselves: list its tools, run the model's tool-use loop, and execute
 * each call over MCP.
 *
 * Hand-rolled (no SDK dependency) because the protocol surface we need is
 * tiny — initialize, tools/list, tools/call — over a single HTTP endpoint,
 * and the scan runs under `node --experimental-strip-types` with `npm ci`,
 * where adding a runtime dep is friction we'd rather avoid.
 *
 * Auth: the LiteLLM MCP gateway takes the same proxy key as the chat
 * endpoint, passed as `x-litellm-api-key: Bearer <key>`.
 *
 * Endpoint: defaults to the PUBLIC gateway path
 * `${LITELLM_BASE_URL}/internet_tool/mcp`. The cluster-internal upstream
 * (…svc:8080/mcp) is not routable from CI, so override with
 * `LITELLM_MCP_URL` only if the public gateway path differs.
 */

import { LITELLM_BASE_URL } from "../litellm.ts";

const MCP_PROTOCOL_VERSION = "2025-06-18";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: number | string;
  result?: {
    tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
    content?: Array<{ type: string; text?: string }>;
    [k: string]: unknown;
  };
  error?: { code: number; message: string; data?: unknown };
};

function mcpEndpoint(): string {
  return (
    process.env.LITELLM_MCP_URL ||
    `${LITELLM_BASE_URL.replace(/\/$/, "")}/internet_tool/mcp`
  );
}

function authHeaderValue(): string {
  const key = process.env.LITELLM_API_KEY;
  if (!key) throw new Error("LITELLM_API_KEY is not set.");
  return `Bearer ${key}`;
}

let sessionId: string | null = null;
let nextId = 1;

/** Parse either a single JSON body or an SSE stream into JSON-RPC responses. */
function parseRpcPayload(raw: string, contentType: string): JsonRpcResponse[] {
  const out: JsonRpcResponse[] = [];
  if (contentType.includes("text/event-stream")) {
    // SSE events are separated by a blank line; collect the `data:` lines.
    for (const block of raw.split(/\r?\n\r?\n/)) {
      const dataLines = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice("data:".length).trim());
      if (dataLines.length === 0) continue;
      try {
        const v = JSON.parse(dataLines.join("\n"));
        if (v && typeof v === "object") out.push(v as JsonRpcResponse);
      } catch {
        // Skip non-JSON events (e.g. pings).
      }
    }
  } else {
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) out.push(...(v as JsonRpcResponse[]));
      else if (v && typeof v === "object") out.push(v as JsonRpcResponse);
    } catch {
      // Leave empty; caller treats a missing response as an error.
    }
  }
  return out;
}

async function rpc(
  method: string,
  params?: Record<string, unknown>,
  isNotification = false,
): Promise<JsonRpcResponse | null> {
  const id = isNotification ? undefined : nextId++;
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (params !== undefined) body.params = params;
  if (!isNotification) body.id = id;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-litellm-api-key": authHeaderValue(),
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(mcpEndpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  // The server assigns a session id on the initialize response; echo it back
  // on every subsequent request.
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  if (isNotification) {
    if (!res.ok && res.status !== 202) {
      throw new Error(`MCP ${method} failed: HTTP ${res.status}`);
    }
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCP ${method} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  const responses = parseRpcPayload(raw, contentType);
  const match = responses.find((r) => r.id === id) ?? responses[0] ?? null;
  if (!match) {
    throw new Error(`MCP ${method}: no JSON-RPC response in ${contentType || "empty body"}`);
  }
  if (match.error) {
    throw new Error(`MCP ${method} error ${match.error.code}: ${match.error.message}`);
  }
  return match;
}

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await rpc("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "ucnfi-scan", version: "1.0.0" },
      });
      await rpc("notifications/initialized", undefined, true);
    })().catch((err) => {
      // Let the next caller retry instead of caching a failed handshake.
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

let toolsCache: McpTool[] | null = null;

/** Discover the search/retrieve tools the internet_tool server advertises. */
export async function listInternetTools(): Promise<McpTool[]> {
  if (toolsCache) return toolsCache;
  await ensureInitialized();
  const res = await rpc("tools/list", {});
  const tools = res?.result?.tools ?? [];
  toolsCache = tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
  }));
  return toolsCache;
}

/** Execute one tool call and return its text content (joined). */
export async function callInternetTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  await ensureInitialized();
  const res = await rpc("tools/call", { name, arguments: args });
  const content = res?.result?.content ?? [];
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  const text = parts.join("\n").trim();
  return text || JSON.stringify(res?.result ?? {});
}
