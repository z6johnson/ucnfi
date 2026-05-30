/**
 * Lightweight baseline + peer-baseline validator.
 *
 * Pre-flight gate for the enrichment workflow, analogous to
 * scripts/validate-committee.ts. Pure Node, no Ajv. Checks structural
 * integrity and provenance of the FieldRecord-shaped baselines, and that any
 * draft changeset round-trips through parseChangeset.
 *
 * Usage:
 *   npm run validate:baseline
 *   node --experimental-strip-types scripts/validate-baseline.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DIMENSION_IDS } from "../lib/baseline.ts";
import { allInventorySources } from "../lib/enrich/inventory.ts";
import { listChangesetIds, parseChangeset } from "../lib/enrich/storage.ts";
import { changesetPath } from "../lib/enrich/storage.ts";

type Issue = { file: string; field: string; message: string };

const REPO_ROOT = process.cwd();
const KNOWN_DIMENSIONS = new Set<string>(DIMENSION_IDS);
const ENTITY_TYPES = new Set(["campus", "health_system", "national_lab", "systemwide"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValue(v: unknown): boolean {
  return typeof v === "boolean" || typeof v === "string" || typeof v === "number" || v === null;
}

function validateFieldBaseline(
  fileLabel: string,
  raw: unknown,
  opts: { requireEntityType: boolean; knownSourceIds: Set<string>; warnings: Issue[] },
): Issue[] {
  const issues: Issue[] = [];
  if (!isObject(raw)) {
    issues.push({ file: fileLabel, field: "(root)", message: "not an object" });
    return issues;
  }
  if (!isObject(raw.metadata) || typeof raw.metadata.version !== "string") {
    issues.push({ file: fileLabel, field: "metadata.version", message: "missing or not a string" });
  }
  if (!isObject(raw.schema) || !isObject((raw.schema as Record<string, unknown>).dimensions)) {
    issues.push({ file: fileLabel, field: "schema.dimensions", message: "missing" });
  }
  if (!isObject(raw.entities)) {
    issues.push({ file: fileLabel, field: "entities", message: "missing" });
    return issues;
  }

  for (const [key, entity] of Object.entries(raw.entities)) {
    if (!isObject(entity)) {
      issues.push({ file: fileLabel, field: key, message: "entity is not an object" });
      continue;
    }
    if (entity.entity_id !== key) {
      issues.push({ file: fileLabel, field: `${key}.entity_id`, message: `does not match key (${String(entity.entity_id)})` });
    }
    if (typeof entity.entity_name !== "string") {
      issues.push({ file: fileLabel, field: `${key}.entity_name`, message: "missing or not a string" });
    }
    if (opts.requireEntityType && !ENTITY_TYPES.has(entity.entity_type as string)) {
      issues.push({ file: fileLabel, field: `${key}.entity_type`, message: `invalid: ${String(entity.entity_type)}` });
    }

    for (const [dim, bucket] of Object.entries(entity)) {
      // Non-dimension keys (entity_id, entity_name, entity_type, peer_kind, etc.) are skipped.
      if (!isObject(bucket)) continue;
      if (!KNOWN_DIMENSIONS.has(dim)) {
        // Buckets that look like field maps but aren't declared dimensions.
        if (Object.values(bucket).every((v) => isObject(v) && "value" in (v as object))) {
          issues.push({ file: fileLabel, field: `${key}.${dim}`, message: "not one of the 10 declared dimensions" });
        }
        continue;
      }
      for (const [field, rec] of Object.entries(bucket)) {
        const where = `${key}.${dim}.${field}`;
        if (!isObject(rec)) {
          issues.push({ file: fileLabel, field: where, message: "FieldRecord is not an object" });
          continue;
        }
        for (const k of ["value", "source_id", "source_url", "notes"]) {
          if (!(k in rec)) issues.push({ file: fileLabel, field: `${where}.${k}`, message: "missing key" });
        }
        if (!isValue(rec.value)) {
          issues.push({ file: fileLabel, field: `${where}.value`, message: "must be boolean|string|number|null" });
        }
        if (rec.source_url !== null && !/^https?:\/\//i.test(String(rec.source_url))) {
          issues.push({ file: fileLabel, field: `${where}.source_url`, message: "must be null or http(s)" });
        }
        const sid = rec.source_id;
        if (sid !== null && typeof sid === "string" && sid !== "inventory-gap" && !sid.startsWith("disc-")) {
          if (opts.knownSourceIds.size > 0 && !opts.knownSourceIds.has(sid)) {
            // Non-fatal: the baseline legitimately carries source_ids beyond
            // inventory_urls.json (SAWG reports, internal decks). Surface it
            // so a reviewer can catch genuinely dangling provenance, but
            // don't fail the gate on the existing corpus.
            opts.warnings.push({ file: fileLabel, field: `${where}.source_id`, message: `"${sid}" not in inventory_urls.json (provenance not catalogued)` });
          }
        }
      }
    }
  }
  return issues;
}

function main(): void {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];

  // Known inventory source ids (for the UC baseline provenance cross-check).
  const knownSourceIds = new Set<string>();
  try {
    for (const s of allInventorySources(REPO_ROOT)) knownSourceIds.add(s.id);
  } catch {
    // inventory missing → skip the cross-check rather than fail hard.
  }

  const ucPath = join(REPO_ROOT, "data", "uc_ai_baseline.json");
  if (existsSync(ucPath)) {
    const raw = JSON.parse(readFileSync(ucPath, "utf-8"));
    issues.push(...validateFieldBaseline("uc_ai_baseline.json", raw, { requireEntityType: true, knownSourceIds, warnings }));
  } else {
    issues.push({ file: "uc_ai_baseline.json", field: "(file)", message: "not found" });
  }

  const peerPath = join(REPO_ROOT, "data", "peer_ai_baseline.json");
  if (existsSync(peerPath)) {
    const raw = JSON.parse(readFileSync(peerPath, "utf-8"));
    // Peers don't carry entity_type; skip that check and the inventory cross-check.
    issues.push(...validateFieldBaseline("peer_ai_baseline.json", raw, { requireEntityType: false, knownSourceIds: new Set(), warnings }));
  }

  // Draft changesets must round-trip through the parser.
  for (const id of listChangesetIds(REPO_ROOT)) {
    try {
      parseChangeset(readFileSync(changesetPath(REPO_ROOT, id), "utf-8"));
    } catch (err) {
      issues.push({ file: `changesets/${id}.md`, field: "(parse)", message: (err as Error).message });
    }
  }

  for (const w of warnings) console.warn(`WARN ${w.file} · ${w.field}: ${w.message}`);

  if (issues.length === 0) {
    console.log(`OK   baseline + peer + changesets valid${warnings.length ? ` (${warnings.length} provenance warning(s))` : ""}`);
    return;
  }
  for (const i of issues) console.error(`FAIL ${i.file} · ${i.field}: ${i.message}`);
  console.error(`\n${issues.length} issue(s)`);
  process.exit(1);
}

main();
