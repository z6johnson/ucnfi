/**
 * Candidate → ProposedChange classifier.
 *
 * Pure functions, no I/O. Given a validated CandidateField and the target's
 * current canonical record, classify the delta into one of five ChangeKinds
 * and decide whether it may be auto-accepted or must go to a human.
 *
 * Governance rule (the core guard): only purely ADDITIVE changes
 * (new_field) and re-confirmations (unchanged_confirmed) of high confidence
 * may be auto-`accepted`. ANY mutation of an existing canonical value —
 * changed_value, newly_contradicted, newly_absent — is forced to
 * `needs_human`, even when otherwise clean. The pipeline can propose
 * flipping a false→true, but never does it unattended.
 */

import type { FieldRecord } from "../baseline.ts";
import type {
  CandidateField,
  ChangeKind,
  ChangeStatus,
  ProposedChange,
} from "./types.ts";

/**
 * Marks a candidate that came from a dead-link sweep: the source that backs
 * the existing value went dead, so we propose recording the absence.
 */
export type DiffContext = {
  /** True when this candidate represents a dead backing source. */
  fromDeadSource?: boolean;
};

function valuesEqual(a: FieldRecord["value"], b: FieldRecord["value"]): boolean {
  return a === b;
}

/** Was the prior canonical value a positive assertion (true / non-empty string)? */
function isPositive(v: FieldRecord["value"]): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.length > 0 && v !== "false" && v !== "absent";
  if (typeof v === "number") return v !== 0;
  return false;
}

/** Is the candidate value a contradiction of a prior positive (false/equivocal)? */
function isContradiction(v: FieldRecord["value"]): boolean {
  return v === false || v === "equivocal" || v === "absent";
}

export function classifyKind(
  current: FieldRecord | null,
  candidate: CandidateField,
  ctx: DiffContext = {},
): ChangeKind {
  if (!current) return "new_field";
  if (valuesEqual(current.value, candidate.record.value)) return "unchanged_confirmed";
  if (ctx.fromDeadSource && isPositive(current.value)) return "newly_absent";
  if (isPositive(current.value) && isContradiction(candidate.record.value)) {
    return "newly_contradicted";
  }
  return "changed_value";
}

/** Auto-acceptable only when additive/confirming AND high confidence. */
function statusFor(kind: ChangeKind, candidate: CandidateField): ChangeStatus {
  if (kind === "new_field" || kind === "unchanged_confirmed") {
    return candidate.confidence === "high" ? "accepted" : "needs_human";
  }
  // changed_value | newly_contradicted | newly_absent → always human-gated.
  return "needs_human";
}

/**
 * Classify a single validated candidate against the current canonical
 * record. `validationReasons` carries any non-fatal notes; a non-empty list
 * forces `needs_human` regardless of kind.
 */
export function classify(
  current: FieldRecord | null,
  candidate: CandidateField,
  opts: { ctx?: DiffContext; validationReasons?: string[] } = {},
): ProposedChange {
  const ctx = opts.ctx ?? {};
  const reasons = opts.validationReasons ?? [];
  const change_kind = classifyKind(current, candidate, ctx);
  let status = statusFor(change_kind, candidate);
  if (reasons.length > 0) status = "needs_human";
  return {
    ...candidate,
    change_kind,
    current_record: current,
    status,
    validation_reasons: reasons,
  };
}
