import { test } from "node:test";
import assert from "node:assert/strict";

import type { FieldRecord } from "../baseline.ts";
import { classify, classifyKind } from "./diff.ts";
import type { CandidateField } from "./types.ts";

function cand(value: FieldRecord["value"], confidence: CandidateField["confidence"] = "high"): CandidateField {
  return {
    entity_id: "uc_merced",
    dimension: "governance",
    field: "has_ai_council",
    record: { value, source_id: "disc-1", source_url: "https://x", notes: "n" },
    source_artifact_id: "disc-1",
    confidence,
  };
}

function rec(value: FieldRecord["value"]): FieldRecord {
  return { value, source_id: "s", source_url: "https://y", notes: "n" };
}

test("new_field when current is absent", () => {
  assert.equal(classifyKind(null, cand(true)), "new_field");
});

test("unchanged_confirmed when values match", () => {
  assert.equal(classifyKind(rec(true), cand(true)), "unchanged_confirmed");
});

test("changed_value when a non-positive value differs", () => {
  assert.equal(classifyKind(rec("draft"), cand("final")), "changed_value");
});

test("newly_contradicted when a prior positive is now false", () => {
  assert.equal(classifyKind(rec(true), cand(false)), "newly_contradicted");
});

test("newly_absent when prior positive and the backing source died", () => {
  assert.equal(classifyKind(rec(true), cand(false), { fromDeadSource: true }), "newly_absent");
});

test("new_field high confidence auto-accepts", () => {
  assert.equal(classify(null, cand(true)).status, "accepted");
});

test("new_field low confidence needs human", () => {
  assert.equal(classify(null, cand(true, "low")).status, "needs_human");
});

test("any value mutation is forced to needs_human even at high confidence", () => {
  assert.equal(classify(rec(false), cand(true)).status, "needs_human");
  assert.equal(classify(rec(true), cand(false)).status, "needs_human");
});

test("validation reasons force needs_human", () => {
  assert.equal(classify(null, cand(true), { validationReasons: ["x"] }).status, "needs_human");
});
