/**
 * Target adapter registry. Builds the right TargetAdapter for a given
 * EnrichTarget, reading fresh canonical state from disk.
 */

import type { EnrichTarget } from "../types.ts";
import type { TargetAdapter } from "../target.ts";
import { makeBaselineAdapter } from "./baseline.ts";
import { makePeerAdapter } from "./peer.ts";
import { makeCommitteeAdapter } from "./committee.ts";

export function makeAdapter(target: EnrichTarget, repoRoot: string): TargetAdapter {
  switch (target) {
    case "baseline":
      return makeBaselineAdapter(repoRoot);
    case "peer":
      return makePeerAdapter(repoRoot);
    case "committee":
      return makeCommitteeAdapter(repoRoot);
    default: {
      const exhaustive: never = target;
      throw new Error(`unknown enrich target: ${String(exhaustive)}`);
    }
  }
}

export { makeBaselineAdapter, makePeerAdapter, makeCommitteeAdapter };
