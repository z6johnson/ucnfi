/**
 * Shared agentic web-search loop over the UCSD TritonAI LiteLLM proxy's
 * `internet_tool` MCP server.
 *
 * The gateway does NOT execute Anthropic's server-side `web_search` tool —
 * the model emits a client-style tool_use and stops (so a plain request
 * returns `searches=0 stop=tool_use` and zero items). So we run the agentic
 * loop ourselves: expose the MCP search tool(s) as normal tools, force a
 * first call (`tool_choice: { type: "any" }`) so the model can't short-circuit
 * to an empty answer, execute each tool call over MCP, and feed results back
 * until the model returns its final JSON.
 *
 * Both the committee activity scan (lib/scan/websearch.ts) and the weekly
 * Brief (lib/brief/sources/web.ts) drive this loop; each caller passes its
 * own model, prompts, and log prefix. The model is asked for strict JSON in
 * its final text block so callers can parse without paying tokens for prose.
 *
 * No "server-only" import: callers run under --experimental-strip-types in
 * Node CLI scripts, not just Next.js.
 *
 * NOTE on the Anthropic SDK below: it is NOT a direct line to
 * api.anthropic.com and NOT a second search path. `getLiteLLMClient()`
 * (lib/litellm.ts) is the Anthropic SDK pointed at the TritonAI LiteLLM
 * proxy via `baseURL`, so it is simply the transport we use to reach the
 * model through the gateway. Live web search still happens entirely over
 * the LiteLLM `internet_tool` MCP (callInternetTool / listInternetTools):
 * the SDK drives the model, the MCP does the searching. Both are required.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { getLiteLLMClient } from "../litellm.ts";
import { type McpTool, callInternetTool, listInternetTools } from "../scan/internet-tool.ts";

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

/**
 * Max number of tool-calling turns before we force the model to answer.
 * Generous so it can search press + each social platform without starving
 * coverage; the model usually stops well before the cap.
 */
export const MAX_TOOL_USES = 8;
/**
 * Cap each tool result fed back to the model so a long page dump can't blow
 * the context window across the loop.
 */
export const MAX_TOOL_RESULT_CHARS = 16000;

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

export function extractFinalText(message: Anthropic.Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n").trim();
}

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
    console.warn(`${logPrefix} agentic-search empty response ${logTag}`);
    return [];
  }
  const parsed = tryParseJsonBlock(text);
  if (!parsed) {
    console.warn(`${logPrefix} agentic-search unparseable response ${logTag}: ${text.slice(0, 200)}`);
    return [];
  }
  return Array.isArray(parsed.items) ? parsed.items : [];
}

/* ------------------------------------------------------------------ */
/* The loop                                                            */
/* ------------------------------------------------------------------ */

export type SearchResult = { text: string; toolCalls: number; stop: string };

export type RunAgenticSearchArgs = {
  systemPrompt: string;
  userPrompt: string;
  maxToolCalls: number;
  logTag: string;
  /** Model id to drive the loop (e.g. SCAN_MODEL or BRIEF_MODEL). */
  model: string;
  /** Log prefix for the warn lines, e.g. "[scan]" or "[brief]". */
  logPrefix?: string;
};

/**
 * Run the model with the `internet_tool` MCP search tool(s) exposed, execute
 * each tool call over MCP, and loop until the model emits its final JSON
 * answer or the tool budget is spent. Replaces the dead server-side
 * `web_search` tool: the gateway only relays messages, so we own the loop.
 *
 * Returns `null` when no search tool is reachable (so the caller skips rather
 * than letting the model hallucinate URLs with no real search backing).
 */
export async function runAgenticSearch(
  args: RunAgenticSearchArgs,
): Promise<SearchResult | null> {
  const logPrefix = args.logPrefix ?? "[scan]";
  let tools: McpTool[];
  try {
    tools = await listInternetTools();
  } catch (err) {
    console.warn(`${logPrefix} agentic-search mcp tools/list failed ${args.logTag} err=${(err as Error).message}`);
    return null;
  }
  if (tools.length === 0) {
    console.warn(`${logPrefix} agentic-search no internet tools advertised ${args.logTag}; skipping`);
    return null;
  }
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  })) as Anthropic.Tool[];
  const toolNames = new Set(tools.map((t) => t.name));

  const client = getLiteLLMClient();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: args.userPrompt },
  ];
  let toolCalls = 0;
  let stop = "?";

  // One iteration beyond the budget runs with no tools, forcing the model to
  // turn its gathered results into the final JSON.
  for (let turn = 0; turn <= args.maxToolCalls; turn++) {
    const offerTools = turn < args.maxToolCalls;
    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model: args.model,
        max_tokens: 2048,
        system: args.systemPrompt,
        messages,
        ...(offerTools
          ? {
              tools: anthropicTools,
              // Force a search on the first turn so the model can't shortcut
              // to {"items": []} without searching; afterwards let it decide.
              tool_choice: turn === 0 ? { type: "any" } : { type: "auto" },
            }
          : {}),
      });
    } catch (err) {
      console.warn(`${logPrefix} agentic-search messages.create failed ${args.logTag} err=${(err as Error).message}`);
      return null;
    }
    stop = resp.stop_reason ?? "?";
    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
      let text = extractFinalText(resp);
      // The model frequently stops on narration ("Let me check…") or empty
      // text instead of the required JSON. Salvage with one no-tools turn that
      // demands the JSON object only.
      if (!text || !tryParseJsonBlock(text)) {
        messages.push({
          role: "assistant",
          content: text ? resp.content : [{ type: "text", text: "(no answer)" }],
        });
        messages.push({
          role: "user",
          content:
            'Output ONLY the JSON object now, exactly {"items": [...]}, including every qualifying item you found above. No prose, no markdown fences. If nothing qualifies, output {"items": []}.',
        });
        try {
          const salvage = await client.messages.create({
            model: args.model,
            max_tokens: 2048,
            system: args.systemPrompt,
            messages,
          });
          stop = `${stop}->reformat:${salvage.stop_reason ?? "?"}`;
          text = extractFinalText(salvage) || text;
        } catch (err) {
          console.warn(`${logPrefix} agentic-search reformat failed ${args.logTag} err=${(err as Error).message}`);
        }
      }
      return { text, toolCalls, stop };
    }

    // Echo the assistant's tool-use turn, then execute each call over MCP.
    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      toolCalls++;
      let output: string;
      if (!toolNames.has(tu.name)) {
        output = `ERROR: unknown tool "${tu.name}"`;
      } else {
        try {
          output = await callInternetTool(tu.name, (tu.input ?? {}) as Record<string, unknown>);
        } catch (err) {
          output = `ERROR: ${(err as Error).message}`;
        }
      }
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: output.slice(0, MAX_TOOL_RESULT_CHARS),
      });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "", toolCalls, stop };
}
