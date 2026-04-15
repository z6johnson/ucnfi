/**
 * Claude integration for the UCNFI research copilot.
 *
 * Assembles the system prompt (mission, pillars, OAs, research
 * topics, principles, response style, and the full Phase 0 baseline),
 * applies prompt-cache breakpoints so every turn after the first
 * reuses the cached input, and exposes a thin streaming wrapper used
 * by /api/chat.
 *
 * Server-only.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  opportunityAreas,
  pillars,
  researchTopics,
} from "@/content/northstar";

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const CLAUDE_MAX_TOKENS = 4096;

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your environment (see README → Deployment → Step 2).",
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

/** Cached across calls — these two strings never change per deploy. */
let cachedFramingBlock: string | null = null;
let cachedBaselineBlock: string | null = null;

function framingBlock(): string {
  if (cachedFramingBlock) return cachedFramingBlock;

  const principles = readFileSync(
    join(process.cwd(), "docs", "responsible-ai-seed-principles.md"),
    "utf-8",
  );

  const pillarsText = pillars
    .map(
      (p) =>
        `Pillar ${p.number} — ${p.name.toUpperCase()}: ${p.statement}`,
    )
    .join("\n");

  const oasText = opportunityAreas
    .map(
      (oa) =>
        `- OA-${oa.number} (${oa.pillar}) ${oa.title}: ${oa.summary}`,
    )
    .join("\n");

  const researchText = researchTopics
    .map((t) => `${t.number}. ${t.prompt}`)
    .join("\n");

  cachedFramingBlock = `You are the UCNFI Research Copilot — an AI assistant for the University of California Next Frontier Initiative Steering Committee. Your user is working through Phase 0 baseline analysis and early Phase 1 synthesis, and relies on you for grounded, cite-every-claim answers about AI governance across the UC system.

## North Star

${pillarsText}

## Opportunity Areas

${oasText}

## Research Topics (Phase 0 → Phase 1)

${researchText}

## Responsible AI Principles (applied to your own outputs)

${principles}

## Grounding rules (non-negotiable)

1. Only make factual claims about UC entities that are supported by the BASELINE DATASET provided below. If the baseline doesn't support a claim, say so explicitly and recommend where the user could enrich the data.
2. Cite every factual claim with an inline marker of the form [entity_id], where entity_id is one of the 20 ids present in the baseline (e.g. [ucop_systemwide], [uc_berkeley], [ucla_health], [lbnl]). Place the marker at the end of the sentence or bullet it supports. Multiple markers on one sentence are fine.
3. Never invent entity ids, source URLs, field names, or notes. When you want to quote something, quote it verbatim from the baseline notes.
4. When asked to compare entities, prefer structured output — a short bulleted list or a small markdown table — over prose.
5. When asked to draft a memo, follow a tight structure: a one-sentence framing, 3–5 bullets of evidence with citations, and a short "open questions" list.

## Response style

- Terse and structural. Labels, headings, lists. Lead with the implication, not the setup.
- No hedging filler. No apologies. No "as an AI".
- Plain markdown. No code fences around prose.
- When there is no good answer from the baseline, say "The baseline does not cover this" and propose what source would.
`;

  return cachedFramingBlock;
}

function baselineBlock(): string {
  if (cachedBaselineBlock) return cachedBaselineBlock;
  const raw = readFileSync(
    join(process.cwd(), "data", "uc_ai_baseline.json"),
    "utf-8",
  );
  cachedBaselineBlock = `## BASELINE DATASET (UC AI Governance, Phase 0, v0.6.0)

The JSON document below is the authoritative source for every factual claim about UC entities. Every entity_id the user cares about appears here. Every dimension, field, value, source_id, source_url, and note lives here.

\`\`\`json
${raw}
\`\`\``;
  return cachedBaselineBlock;
}

/** Prompt-cached system array. Two breakpoints: framing + baseline. */
export function systemPrompt(): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: framingBlock(),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: baselineBlock(),
      cache_control: { type: "ephemeral" },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/**
 * Start a streaming Claude response for a user turn. The caller is
 * responsible for plumbing the SDK's AsyncIterable of events into
 * whatever transport they're using (SSE from a Route Handler).
 */
export function startChatStream(messages: ChatMessage[]) {
  const anthropic = getAnthropic();
  return anthropic.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system: systemPrompt(),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
}
