/**
 * LiteLLM client + model config for the UCNFI app.
 *
 * No "server-only" import: this module is shared by Next.js server
 * code (via lib/claude.ts) and the Node CLI scan/digest scripts, so it
 * must resolve under plain `node --experimental-strip-types` as well.
 */

import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MAX_TOKENS = 4096;
// `||` (not `??`) so empty-string env vars — what GitHub Actions
// produces from an unset `vars.X` interpolation — fall back to the
// default. With `??` we'd send `model: ""` to the API and 400 out.
export const LITELLM_BASE_URL =
  process.env.LITELLM_BASE_URL || "https://tritonai-api.ucsd.edu";
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

export type Provider = "litellm";

let litellmClient: Anthropic | null = null;

export function getLiteLLMClient(): Anthropic {
  if (!litellmClient) {
    const authToken = process.env.LITELLM_API_KEY;
    if (!authToken) {
      throw new Error("LITELLM_API_KEY is not set.");
    }
    litellmClient = new Anthropic({
      authToken,
      baseURL: LITELLM_BASE_URL,
      apiKey: null,
    });
  }
  return litellmClient;
}

export function assertLiteLLMConfigured(): void {
  if (!process.env.LITELLM_API_KEY) {
    throw new Error("LITELLM_API_KEY is not set.");
  }
}
