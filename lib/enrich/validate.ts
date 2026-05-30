/**
 * Candidate validator — the anti-hallucination gate.
 *
 * Mirrors lib/brief/validate.ts: every candidate is checked against the
 * target's schema/coordinate rules AND against the set of sources actually
 * fetched/discovered this run. A candidate whose source_url was NOT in the
 * run's source set is rejected outright — the model cannot smuggle an
 * imagined citation into the authoritative baseline.
 *
 * Accepted candidates flow on to diff.classify; rejected ones are preserved
 * in a .rejected.json sidecar (auditable in git), exactly like the Brief.
 */

import { canonicalUrl } from "../activity.ts";
import type { CandidateField, SourceSet } from "./types.ts";
import type { TargetAdapter } from "./target.ts";

export type ValidationFailure = {
  candidate: CandidateField;
  reasons: string[];
};

export type ValidationResult = {
  accepted: CandidateField[];
  rejected: ValidationFailure[];
};

const FIELD_NAME_PATTERN = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;

function isValidValue(v: unknown): boolean {
  return (
    typeof v === "boolean" ||
    typeof v === "string" ||
    typeof v === "number" ||
    v === null
  );
}

/**
 * Validate one candidate. Returns a list of rejection reasons; empty means
 * the candidate is accepted. `sourceUrls` is the canonicalised set of URLs
 * actually provided to the model this run.
 */
export function validateCandidate(
  candidate: CandidateField,
  adapter: TargetAdapter,
  sourceUrls: Set<string>,
): string[] {
  const reasons: string[] = [];

  // Coordinate (entity/dimension/field) — target-specific.
  reasons.push(...adapter.validateCoordinate(candidate));

  // Field-name shape (snake_case / dotted path, lowercase).
  if (!candidate.field || !FIELD_NAME_PATTERN.test(candidate.field)) {
    reasons.push(`field "${candidate.field}" is not a valid lowercase field name`);
  }

  const rec = candidate.record;

  // Value type.
  if (!rec || !isValidValue(rec.value)) {
    reasons.push(`record.value must be boolean|string|number|null, got ${JSON.stringify(rec?.value)}`);
  }

  // Provenance must be present.
  if (!rec?.source_id) {
    reasons.push("record.source_id is missing");
  }
  if (!rec?.source_url || !/^https?:\/\//i.test(rec.source_url)) {
    reasons.push(`record.source_url is not http(s): ${rec?.source_url}`);
  } else {
    // Anti-hallucination: the cited URL must be one we actually fetched or
    // discovered this run. No imagined citations into the baseline.
    if (!sourceUrls.has(canonicalUrl(rec.source_url))) {
      reasons.push(
        `record.source_url "${rec.source_url}" was not in the run's fetched/discovered source set (possible hallucinated citation)`,
      );
    }
  }

  // Every positive assertion must be evidenced with a note.
  if (rec && rec.value !== false && rec.value !== null && !rec.notes?.trim()) {
    reasons.push("record.notes is empty for a non-false claim — every positive claim must be evidenced");
  }

  return reasons;
}

export function validateCandidates(
  candidates: CandidateField[],
  adapter: TargetAdapter,
  sourceSet: SourceSet,
): ValidationResult {
  const sourceUrls = new Set<string>();
  for (const { url } of sourceSet.values()) sourceUrls.add(canonicalUrl(url));

  const accepted: CandidateField[] = [];
  const rejected: ValidationFailure[] = [];
  for (const candidate of candidates) {
    const reasons = validateCandidate(candidate, adapter, sourceUrls);
    if (reasons.length === 0) accepted.push(candidate);
    else rejected.push({ candidate, reasons });
  }
  return { accepted, rejected };
}
