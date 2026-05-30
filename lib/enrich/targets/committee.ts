/**
 * Committee directory target adapter (data/ucnfi-committee/records/*.json).
 *
 * Re-verifies the small set of STRUCTURED member facts that drift over time
 * — primary title, organization, department, and committee role — distinct
 * from the daily activity feed (which is unchanged). The member synopsis is
 * also re-verifiable as free text.
 *
 * To flow through the same FieldRecord-shaped engine, each verifiable fact
 * is addressed as a coordinate: entity_id = member_id, dimension = "profile",
 * field = a dotted path on a tight allowlist. getRecord wraps the current
 * value into a FieldRecord (value = the current string) so diff.classify can
 * compare proposed vs. current.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { FieldRecord } from "../../baseline.ts";
import type { CandidateField } from "../types.ts";
import type { TargetAdapter } from "../target.ts";

export const COMMITTEE_DIMENSION = "profile";

/** The only member-record paths the pipeline may propose changes to. */
export const COMMITTEE_FIELD_ALLOWLIST = [
  "primary_affiliation.title",
  "primary_affiliation.organization",
  "primary_affiliation.department",
  "committee_role.role",
  "enrichment.synopsis",
] as const;

const ALLOW = new Set<string>(COMMITTEE_FIELD_ALLOWLIST);

function recordsDir(repoRoot: string): string {
  return join(repoRoot, "data", "ucnfi-committee", "records");
}

function memberPath(repoRoot: string, memberId: string): string {
  return join(recordsDir(repoRoot), `${memberId}.json`);
}

function pick(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>(
    (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

export function makeCommitteeAdapter(repoRoot: string): TargetAdapter {
  const dir = recordsDir(repoRoot);
  const ids = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -".json".length))
    : [];

  // Cache the loaded records (read fresh per adapter construction).
  const cache = new Map<string, Record<string, unknown>>();
  const load = (memberId: string): Record<string, unknown> | null => {
    if (cache.has(memberId)) return cache.get(memberId)!;
    const p = memberPath(repoRoot, memberId);
    if (!existsSync(p)) return null;
    const rec = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    cache.set(memberId, rec);
    return rec;
  };

  return {
    target: "committee",
    version: () => {
      // Committee records are versioned per-record; report the schema_version
      // of the first record as a coarse marker for the changeset.
      const first = ids[0] ? load(ids[0]) : null;
      const rm = first?.["record_meta"] as Record<string, unknown> | undefined;
      return (rm?.["schema_version"] as string) ?? "1.0.0";
    },
    entityIds: () => ids,
    entityName: (id) => {
      const rec = load(id);
      const name = rec?.["name"] as Record<string, unknown> | undefined;
      return (name?.["full"] as string) ?? id;
    },
    getRecord(memberId, dimension, field): FieldRecord | null {
      if (dimension !== COMMITTEE_DIMENSION || !ALLOW.has(field)) return null;
      const rec = load(memberId);
      if (!rec) return null;
      const current = pick(rec, field);
      if (current === undefined) return null;
      const value =
        typeof current === "string" || typeof current === "number" || typeof current === "boolean"
          ? (current as FieldRecord["value"])
          : null;
      // Wrap the current value as a FieldRecord so diff can compare.
      return { value, source_id: null, source_url: null, notes: null };
    },
    validateCoordinate(candidate: CandidateField): string[] {
      const reasons: string[] = [];
      if (!ids.includes(candidate.entity_id)) {
        reasons.push(`member_id "${candidate.entity_id}" is not a known committee member`);
      }
      if (candidate.dimension !== COMMITTEE_DIMENSION) {
        reasons.push(`committee dimension must be "${COMMITTEE_DIMENSION}", got "${candidate.dimension}"`);
      }
      if (!ALLOW.has(candidate.field)) {
        reasons.push(
          `committee field "${candidate.field}" is not on the re-verification allowlist [${[...ALLOW].join(", ")}]`,
        );
      }
      return reasons;
    },
  };
}
