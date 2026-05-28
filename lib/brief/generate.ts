/**
 * Brief generator.
 *
 * Pulls four feeds, calls Claude with structured-output instructions,
 * validates every anchor against the live baseline / peer baseline /
 * committee directory, and returns the draft edition. The caller
 * (scripts/brief-weekly.ts) writes it to disk.
 */

import type Anthropic from "@anthropic-ai/sdk";

import {
  isoNowUTC,
  isoWeekLabel,
} from "../activity.ts";
import { CLAUDE_MODEL, getLiteLLMClient } from "../litellm.ts";
import { collectCommitteeSignal } from "./sources/committee.ts";
import { collectExternal } from "./sources/external.ts";
import { collectPeerMoves } from "./sources/peers.ts";
import { collectVendor } from "./sources/vendor.ts";
import {
  baselineBlock,
  briefFramingBlock,
  committeeContextSummary,
  peerBaselineBlock,
  userInputsBlock,
} from "./prompt.ts";
import { validateItems, type ValidationResult } from "./validate.ts";
import type {
  BriefEdition,
  BriefItem,
  BriefRawItem,
  EditionStatus,
  InputsManifest,
  SourcesConfig,
} from "./types.ts";

const BRIEF_MODEL = process.env.BRIEF_MODEL || CLAUDE_MODEL;
const BRIEF_MAX_TOKENS = 4096;

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type GenerateBriefOpts = {
  repoRoot: string;
  endDate: Date;
  config: SourcesConfig;
  /** Lookback for external / peer / vendor RSS feeds. Default 7 days. */
  feedLookbackDays?: number;
  /** Lookback for committee signal (matches Brief cadence). Default 7. */
  committeeWindowDays?: number;
};

export type GenerateBriefResult = {
  edition: BriefEdition;
  validation: ValidationResult;
  rawItems: BriefRawItem[];
};

export async function generateBrief(
  opts: GenerateBriefOpts,
): Promise<GenerateBriefResult> {
  const feedLookback = opts.feedLookbackDays ?? 7;
  const committeeWindow = opts.committeeWindowDays ?? 7;

  // Collect the four feeds in parallel. Each collector swallows
  // individual feed errors so one broken RSS endpoint doesn't sink
  // the whole run.
  const [external, peer, vendor, committee] = await Promise.all([
    collectExternal({ config: opts.config, lookbackDays: feedLookback }),
    collectPeerMoves({ config: opts.config, lookbackDays: feedLookback }),
    collectVendor({ config: opts.config, lookbackDays: feedLookback }),
    Promise.resolve(
      collectCommitteeSignal({
        repoRoot: opts.repoRoot,
        endDate: opts.endDate,
        windowDays: committeeWindow,
      }),
    ),
  ]);

  const allRaw = [...external, ...peer, ...vendor, ...committee.items];
  const isoWeek = isoWeekLabel(opts.endDate);
  const windowFrom = computeWindowStart(opts.endDate, feedLookback);
  const windowTo = isoDateOf(opts.endDate);

  const manifest: InputsManifest = {
    external: { from: windowFrom, to: windowTo, n: external.length },
    peer: { from: windowFrom, to: windowTo, n: peer.length },
    vendor: { from: windowFrom, to: windowTo, n: vendor.length },
    committee_signal_dates: committee.windowDates,
  };

  // Empty-input short-circuit: if every bucket is empty, return an
  // edition with zero items in draft state. No reason to call the
  // model to say "nothing happened" — and Claude would helpfully
  // invent something if asked.
  if (allRaw.length === 0) {
    return emptyEdition({
      isoWeek,
      endDate: opts.endDate,
      manifest,
      rawItems: allRaw,
    });
  }

  const userPrompt = userInputsBlock({
    isoWeek,
    windowFrom,
    windowTo,
    external,
    peer,
    vendor,
    committee: committee.items,
  });

  const message = await getLiteLLMClient().messages.create({
    model: BRIEF_MODEL,
    max_tokens: BRIEF_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: briefFramingBlock(),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: baselineBlock(),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: peerBaselineBlock(),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: `## COMMITTEE DIRECTORY\n\n${committeeContextSummary()}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const drafted = parseDraftResponse(message);
  const validation = validateItems(drafted, allRaw);

  const edition: BriefEdition = {
    edition_id: isoWeek,
    week_ending: windowTo,
    status: "draft" as EditionStatus,
    reviewed_by: "",
    reviewed_at: "",
    generated_at: isoNowUTC(),
    generated_by_model: BRIEF_MODEL,
    inputs_manifest: manifest,
    items: validation.accepted,
  };

  return { edition, validation, rawItems: allRaw };
}

/* ------------------------------------------------------------------ */
/* Response parsing                                                    */
/* ------------------------------------------------------------------ */

function extractText(message: Anthropic.Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n").trim();
}

function tryParseJson(text: string): unknown | null {
  let s = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // Last resort: first { ... last }
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseDraftResponse(message: Anthropic.Message): BriefItem[] {
  const text = extractText(message);
  const parsed = tryParseJson(text);
  if (!parsed || typeof parsed !== "object") return [];
  const items = (parsed as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  // The structure is trusted to the validator — here we just shape
  // it to BriefItem and let validateItems reject anything broken.
  return items.map((raw, idx) => normalizeItem(raw, idx + 1));
}

function normalizeItem(raw: unknown, ordinal: number): BriefItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const itemId =
    typeof r.item_id === "string" && r.item_id.trim()
      ? r.item_id.trim()
      : `item-${ordinal}`;
  const priorityRaw = Number(r.priority);
  const priority: 1 | 2 | 3 | 4 =
    priorityRaw === 1 || priorityRaw === 2 || priorityRaw === 3 || priorityRaw === 4
      ? (priorityRaw as 1 | 2 | 3 | 4)
      : 1;
  return {
    item_id: itemId,
    priority,
    headline: stringField(r.headline),
    what_happened: stringField(r.what_happened),
    why_it_matters: stringField(r.why_it_matters),
    for_the_committee: stringField(r.for_the_committee),
    feed_sources: Array.isArray(r.feed_sources)
      ? (r.feed_sources as BriefItem["feed_sources"])
      : [],
    baseline_anchors: Array.isArray(r.baseline_anchors)
      ? (r.baseline_anchors as BriefItem["baseline_anchors"])
      : [],
    peer_anchors: Array.isArray(r.peer_anchors)
      ? (r.peer_anchors as BriefItem["peer_anchors"])
      : [],
    experts: Array.isArray(r.experts)
      ? (r.experts as BriefItem["experts"])
      : [],
  };
}

function stringField(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/* ------------------------------------------------------------------ */
/* Date helpers (local to the generator)                               */
/* ------------------------------------------------------------------ */

function isoDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeWindowStart(end: Date, lookbackDays: number): string {
  const d = new Date(end);
  d.setUTCDate(d.getUTCDate() - (lookbackDays - 1));
  return isoDateOf(d);
}

function emptyEdition(args: {
  isoWeek: string;
  endDate: Date;
  manifest: InputsManifest;
  rawItems: BriefRawItem[];
}): GenerateBriefResult {
  const edition: BriefEdition = {
    edition_id: args.isoWeek,
    week_ending: isoDateOf(args.endDate),
    status: "draft",
    reviewed_by: "",
    reviewed_at: "",
    generated_at: isoNowUTC(),
    generated_by_model: BRIEF_MODEL,
    inputs_manifest: args.manifest,
    items: [],
  };
  return {
    edition,
    validation: { accepted: [], rejected: [] },
    rawItems: args.rawItems,
  };
}
