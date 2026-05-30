import { test } from "node:test";
import assert from "node:assert/strict";

import type { FieldRecord } from "../baseline.ts";
import type { TargetAdapter } from "./target.ts";
import type { CandidateField, SourceSet } from "./types.ts";
import { validateCandidates } from "./validate.ts";

const adapter: TargetAdapter = {
  target: "baseline",
  version: () => "0.7.0",
  entityIds: () => ["uc_merced"],
  entityName: () => "UC Merced",
  getRecord: () => null,
  validateCoordinate: (c) => {
    const reasons: string[] = [];
    if (c.entity_id !== "uc_merced") reasons.push("unknown entity");
    if (c.dimension !== "governance") reasons.push("unknown dimension");
    return reasons;
  },
};

const GOOD_URL = "https://example.org/doc";
function sourceSet(): SourceSet {
  const s: SourceSet = new Map();
  s.set(GOOD_URL, { source_id: "disc-1", url: GOOD_URL });
  return s;
}

function cand(over: Partial<FieldRecord> & { field?: string } = {}): CandidateField {
  const { field, ...recOver } = over;
  return {
    entity_id: "uc_merced",
    dimension: "governance",
    field: field ?? "has_ai_council",
    record: { value: true, source_id: "disc-1", source_url: GOOD_URL, notes: "n", ...recOver },
    source_artifact_id: "disc-1",
    confidence: "high",
  };
}

test("accepts a well-formed candidate citing a real run source", () => {
  const r = validateCandidates([cand()], adapter, sourceSet());
  assert.equal(r.accepted.length, 1);
  assert.equal(r.rejected.length, 0);
});

test("rejects a candidate citing a URL not in the run source set (hallucination gate)", () => {
  const r = validateCandidates([cand({ source_url: "https://made-up.example/x" })], adapter, sourceSet());
  assert.equal(r.accepted.length, 0);
  assert.match(r.rejected[0].reasons.join(" "), /hallucinated citation|not in the run/);
});

test("rejects an unknown dimension/entity via the adapter", () => {
  const c = cand();
  c.dimension = "made_up";
  const r = validateCandidates([c], adapter, sourceSet());
  assert.equal(r.accepted.length, 0);
});

test("rejects a positive value with no notes", () => {
  const r = validateCandidates([cand({ notes: "" })], adapter, sourceSet());
  assert.equal(r.accepted.length, 0);
  assert.match(r.rejected[0].reasons.join(" "), /notes is empty/);
});

test("rejects a non-snake-case field name", () => {
  const r = validateCandidates([cand({ field: "Has AI Council" })], adapter, sourceSet());
  assert.equal(r.accepted.length, 0);
});

test("allows a false value with empty notes", () => {
  const r = validateCandidates([cand({ value: false, notes: "" })], adapter, sourceSet());
  assert.equal(r.accepted.length, 1);
});
