/**
 * UC baseline target adapter (data/uc_ai_baseline.json) — the reference
 * implementation and primary "shared picture" surface.
 */

import { makeFieldBaselineAdapter } from "./fieldbaseline.ts";
import type { TargetAdapter } from "../target.ts";

export const BASELINE_FILE = "uc_ai_baseline.json";

export function makeBaselineAdapter(repoRoot: string): TargetAdapter {
  return makeFieldBaselineAdapter("baseline", repoRoot, BASELINE_FILE);
}
