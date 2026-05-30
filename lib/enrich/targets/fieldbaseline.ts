/**
 * Shared adapter factory for the two FieldRecord-shaped targets: the UC
 * baseline (data/uc_ai_baseline.json) and the peer baseline
 * (data/peer_ai_baseline.json). Both store entities as
 * `{ [dimension]: { [field]: FieldRecord } }`, so the same coordinate
 * lookups and validation apply — only the file path and metadata differ.
 *
 * Reads fresh from disk given a repoRoot so the adapter reflects the
 * current canonical state even mid-process (apply.ts re-reads after a write).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DIMENSION_IDS, type FieldRecord } from "../../baseline.ts";
import type { CandidateField, EnrichTarget } from "../types.ts";
import type { TargetAdapter } from "../target.ts";

const KNOWN_DIMENSIONS = new Set<string>(DIMENSION_IDS);

type RawEntity = {
  entity_name?: string;
} & Record<string, unknown>;

type RawFieldBaseline = {
  metadata: { version?: string };
  entities: Record<string, RawEntity>;
};

export function makeFieldBaselineAdapter(
  target: EnrichTarget,
  repoRoot: string,
  fileName: string,
): TargetAdapter {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, "data", fileName), "utf-8"),
  ) as RawFieldBaseline;

  return {
    target,
    version: () => raw.metadata?.version ?? "0.0.0",
    entityIds: () => Object.keys(raw.entities),
    entityName: (id) => raw.entities[id]?.entity_name,
    getRecord(entityId, dimension, field): FieldRecord | null {
      const bucket = raw.entities[entityId]?.[dimension];
      if (!bucket || typeof bucket !== "object") return null;
      const rec = (bucket as Record<string, FieldRecord>)[field];
      return rec ?? null;
    },
    validateCoordinate(candidate: CandidateField): string[] {
      const reasons: string[] = [];
      if (!raw.entities[candidate.entity_id]) {
        reasons.push(`entity_id "${candidate.entity_id}" is not in the ${target} baseline`);
      }
      if (!KNOWN_DIMENSIONS.has(candidate.dimension)) {
        reasons.push(`dimension "${candidate.dimension}" is not one of the 10 declared dimensions`);
      }
      return reasons;
    },
  };
}
