/**
 * Target adapter interface.
 *
 * The enrichment engine (fetch → discover → extract → validate → diff →
 * changeset) is generic over a TARGET: the UC baseline, the peer baseline,
 * or the committee directory. Each target supplies a thin adapter that
 * knows how to read its current canonical state and validate a coordinate.
 *
 * Adapters never WRITE — apply.ts owns the only mutation path, behind the
 * human-review gate.
 */

import type { FieldRecord } from "../baseline.ts";
import type { CandidateField, EnrichTarget } from "./types.ts";

export type TargetAdapter = {
  target: EnrichTarget;

  /** Current canonical version string (e.g. baseline metadata.version). */
  version(): string;

  /** All entity (or member) ids in this target. */
  entityIds(): string[];

  /** Human-readable name for an entity/member, if known. */
  entityName(entityId: string): string | undefined;

  /**
   * The current canonical record at (entity, dimension, field), or null if
   * absent. For committee, `field` is a dotted path into the member record.
   */
  getRecord(entityId: string, dimension: string, field: string): FieldRecord | null;

  /**
   * Target-specific structural check of a candidate's coordinate
   * (entity exists, dimension is in range, field shape is valid). Returns a
   * list of human-readable reasons; empty means the coordinate is valid.
   * Value/source/anti-hallucination checks live in validate.ts, shared
   * across targets.
   */
  validateCoordinate(candidate: CandidateField): string[];
};
