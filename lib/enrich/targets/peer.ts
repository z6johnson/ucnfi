/**
 * Peer baseline target adapter (data/peer_ai_baseline.json). Same
 * FieldRecord/dimension/field shape as the UC baseline (see lib/peers.ts),
 * so it reuses the shared field-baseline adapter wholesale.
 */

import { makeFieldBaselineAdapter } from "./fieldbaseline.ts";
import type { TargetAdapter } from "../target.ts";

export const PEER_FILE = "peer_ai_baseline.json";

export function makePeerAdapter(repoRoot: string): TargetAdapter {
  return makeFieldBaselineAdapter("peer", repoRoot, PEER_FILE);
}
