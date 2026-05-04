/**
 * Lightweight committee record validator.
 *
 * Checks that every record under `data/ucnfi-committee/records/`:
 *   - parses as JSON
 *   - has every top-level field the schema marks required
 *   - uses valid enum values where the schema constrains them
 *   - has a member_id matching its filename
 *   - has a synopsis within the 200–1200 char window
 *   - declares the expected schema_version
 *   - lists OAs from the OA-1..OA-8 vocabulary, with a relevance enum
 *
 * Intentionally does *not* depend on Ajv. The Python validator
 * (`data/ucnfi-committee/scripts/validate.py`) is the authoritative
 * full JSON Schema check; this TS script catches the most common
 * breakages without adding a runtime dependency, and runs anywhere
 * Node 22 runs.
 *
 * Usage:
 *   npx tsx scripts/validate-committee.ts
 *   node --experimental-strip-types scripts/validate-committee.ts
 *   npm run validate:committee
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

type Issue = { file: string; field: string; message: string };

const RECORDS_DIR = join(
  process.cwd(),
  "data",
  "ucnfi-committee",
  "records",
);

const EXPECTED_SCHEMA_VERSION = "1.0.0";

const COMMITTEE_ROLES = [
  "co_chair",
  "special_advisor",
  "member",
  "advisory_board",
  "support_team",
  "student_member",
];

const SECTORS = [
  "uc_campus",
  "ucop",
  "uc_health",
  "national_lab",
  "industry",
  "state_government",
  "nonprofit_or_network",
  "venture_capital",
  "other",
];

const AI_RELATIONSHIPS = [
  "builder_or_researcher",
  "deployer_or_operator",
  "governor_or_policy",
  "critic_or_scholar",
  "investor_or_market",
  "user_representative",
];

const GOVERNANCE_ORIENTATIONS = [
  "academic_senate",
  "campus_administration",
  "system_administration",
  "health_system",
  "state_policy",
  "industry_standards",
  "research_integrity",
  "student_affairs",
];

const OA_IDS = ["OA-1", "OA-2", "OA-3", "OA-4", "OA-5", "OA-6", "OA-7", "OA-8"];

const OA_RELEVANCE = ["primary", "secondary"];

const CONFIDENCE = ["high", "medium", "low"];

const MEMBER_ID_PATTERN = /^[a-z]+(-[a-z]+)*-[a-z]$/;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkEnum(
  issues: Issue[],
  file: string,
  field: string,
  value: unknown,
  allowed: string[],
) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      file,
      field,
      message: `expected one of [${allowed.join(", ")}], got ${JSON.stringify(value)}`,
    });
  }
}

function checkRequired(
  issues: Issue[],
  file: string,
  obj: Record<string, unknown>,
  fields: string[],
  prefix = "",
) {
  for (const f of fields) {
    if (!(f in obj) || obj[f] === undefined || obj[f] === null) {
      issues.push({
        file,
        field: `${prefix}${f}`,
        message: "required field missing or null",
      });
    }
  }
}

function validateRecord(filename: string, record: unknown): Issue[] {
  const issues: Issue[] = [];
  const file = filename;

  if (!isObject(record)) {
    issues.push({ file, field: "(root)", message: "record is not an object" });
    return issues;
  }

  // ---------- Top-level required fields ----------
  checkRequired(issues, file, record, [
    "member_id",
    "name",
    "primary_affiliation",
    "committee_role",
    "enrichment",
    "record_meta",
  ]);

  // ---------- member_id ----------
  const memberId = record["member_id"];
  if (typeof memberId === "string") {
    if (!MEMBER_ID_PATTERN.test(memberId)) {
      issues.push({
        file,
        field: "member_id",
        message: `does not match pattern ^[a-z]+(-[a-z]+)*-[a-z]$`,
      });
    }
    const expectedFilename = `${memberId}.json`;
    if (basename(file) !== expectedFilename) {
      issues.push({
        file,
        field: "member_id",
        message: `member_id ${memberId} does not match filename ${basename(file)}`,
      });
    }
  }

  // ---------- name ----------
  if (isObject(record["name"])) {
    checkRequired(issues, file, record["name"], ["full"], "name.");
  }

  // ---------- primary_affiliation ----------
  if (isObject(record["primary_affiliation"])) {
    checkRequired(
      issues,
      file,
      record["primary_affiliation"],
      ["organization", "title"],
      "primary_affiliation.",
    );
  }

  // ---------- committee_role ----------
  if (isObject(record["committee_role"])) {
    const role = record["committee_role"]["role"];
    checkEnum(issues, file, "committee_role.role", role, COMMITTEE_ROLES);
  }

  // ---------- enrichment ----------
  if (isObject(record["enrichment"])) {
    const e = record["enrichment"];
    checkRequired(issues, file, e, ["expertise_tags", "synopsis", "sources"], "enrichment.");

    // expertise_tags
    if (Array.isArray(e["expertise_tags"])) {
      if (e["expertise_tags"].length > 4) {
        issues.push({
          file,
          field: "enrichment.expertise_tags",
          message: `cap is 4, found ${e["expertise_tags"].length}`,
        });
      }
      e["expertise_tags"].forEach((t, i) => {
        if (!isObject(t)) return;
        if (typeof t["tag"] !== "string" || t["tag"].length === 0) {
          issues.push({
            file,
            field: `enrichment.expertise_tags[${i}].tag`,
            message: "missing or empty",
          });
        }
        checkEnum(
          issues,
          file,
          `enrichment.expertise_tags[${i}].confidence`,
          t["confidence"],
          CONFIDENCE,
        );
      });
    }

    // opportunity_areas
    if (Array.isArray(e["opportunity_areas"])) {
      if (e["opportunity_areas"].length > 3) {
        issues.push({
          file,
          field: "enrichment.opportunity_areas",
          message: `cap is 3, found ${e["opportunity_areas"].length}`,
        });
      }
      e["opportunity_areas"].forEach((o, i) => {
        if (!isObject(o)) return;
        checkEnum(
          issues,
          file,
          `enrichment.opportunity_areas[${i}].oa`,
          o["oa"],
          OA_IDS,
        );
        checkEnum(
          issues,
          file,
          `enrichment.opportunity_areas[${i}].relevance`,
          o["relevance"],
          OA_RELEVANCE,
        );
      });
    }

    // role_facets
    if (isObject(e["role_facets"])) {
      const f = e["role_facets"];
      if (f["sector"] !== undefined) {
        checkEnum(issues, file, "enrichment.role_facets.sector", f["sector"], SECTORS);
      }
      if (Array.isArray(f["ai_relationship"])) {
        f["ai_relationship"].forEach((v, i) =>
          checkEnum(
            issues,
            file,
            `enrichment.role_facets.ai_relationship[${i}]`,
            v,
            AI_RELATIONSHIPS,
          ),
        );
      }
      if (Array.isArray(f["governance_orientation"])) {
        f["governance_orientation"].forEach((v, i) =>
          checkEnum(
            issues,
            file,
            `enrichment.role_facets.governance_orientation[${i}]`,
            v,
            GOVERNANCE_ORIENTATIONS,
          ),
        );
      }
    }

    // synopsis length
    if (typeof e["synopsis"] === "string") {
      const len = e["synopsis"].length;
      if (len < 200 || len > 1200) {
        issues.push({
          file,
          field: "enrichment.synopsis",
          message: `length ${len} outside required 200..1200`,
        });
      }
    }

    // sources
    if (Array.isArray(e["sources"])) {
      if (e["sources"].length === 0) {
        issues.push({
          file,
          field: "enrichment.sources",
          message: "must have at least one source",
        });
      }
      e["sources"].forEach((s, i) => {
        if (!isObject(s)) return;
        if (typeof s["url"] !== "string") {
          issues.push({
            file,
            field: `enrichment.sources[${i}].url`,
            message: "missing or not a string",
          });
        }
        if (typeof s["type"] !== "string") {
          issues.push({
            file,
            field: `enrichment.sources[${i}].type`,
            message: "missing or not a string",
          });
        }
        if (
          typeof s["accessed"] !== "string" ||
          !ISO_DATE_PATTERN.test(s["accessed"])
        ) {
          issues.push({
            file,
            field: `enrichment.sources[${i}].accessed`,
            message: "missing or not in YYYY-MM-DD format",
          });
        }
      });
    }
  }

  // ---------- record_meta ----------
  if (isObject(record["record_meta"])) {
    const rm = record["record_meta"];
    checkRequired(
      issues,
      file,
      rm,
      ["created", "last_verified", "schema_version"],
      "record_meta.",
    );
    if (
      typeof rm["created"] === "string" &&
      !ISO_DATE_PATTERN.test(rm["created"])
    ) {
      issues.push({
        file,
        field: "record_meta.created",
        message: "not in YYYY-MM-DD format",
      });
    }
    if (
      typeof rm["last_verified"] === "string" &&
      !ISO_DATE_PATTERN.test(rm["last_verified"])
    ) {
      issues.push({
        file,
        field: "record_meta.last_verified",
        message: "not in YYYY-MM-DD format",
      });
    }
    if (
      typeof rm["schema_version"] === "string" &&
      rm["schema_version"] !== EXPECTED_SCHEMA_VERSION
    ) {
      issues.push({
        file,
        field: "record_meta.schema_version",
        message: `expected ${EXPECTED_SCHEMA_VERSION}, got ${rm["schema_version"]}`,
      });
    }
  }

  return issues;
}

function main() {
  const argv = process.argv.slice(2);
  const files = argv.length
    ? argv
    : readdirSync(RECORDS_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => join(RECORDS_DIR, f));

  let totalIssues = 0;
  const reconciliationCounts = {
    not_yet_reconciled: 0,
    reconciled: 0,
    flagged: 0,
    other: 0,
  };
  let needsAttentionTotal = 0;

  for (const path of files) {
    let record: unknown;
    try {
      record = JSON.parse(readFileSync(path, "utf-8"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAIL ${basename(path)}: invalid JSON — ${message}`);
      totalIssues += 1;
      continue;
    }

    const issues = validateRecord(path, record);
    if (issues.length === 0) {
      console.log(`OK   ${basename(path)}`);
    } else {
      console.error(`FAIL ${basename(path)}`);
      for (const i of issues) {
        console.error(`     ${i.field}: ${i.message}`);
      }
      totalIssues += issues.length;
    }

    // Reconciliation + needs_attention surface (informational, not failures)
    if (isObject(record)) {
      const recon = record["reconciliation"];
      if (isObject(recon) && typeof recon["status"] === "string") {
        const s = recon["status"];
        if (s === "not_yet_reconciled") reconciliationCounts.not_yet_reconciled += 1;
        else if (s.startsWith("reconciled")) reconciliationCounts.reconciled += 1;
        else if (s === "flagged_for_discussion") reconciliationCounts.flagged += 1;
        else reconciliationCounts.other += 1;
      }
      const rm = record["record_meta"];
      if (isObject(rm) && Array.isArray(rm["needs_attention"])) {
        needsAttentionTotal += rm["needs_attention"].length;
      }
    }
  }

  console.log("");
  console.log(`${files.length} records · ${totalIssues} issues`);
  console.log(
    `Reconciliation: ${reconciliationCounts.not_yet_reconciled} pending · ${reconciliationCounts.reconciled} reconciled · ${reconciliationCounts.flagged} flagged`,
  );
  console.log(`needs_attention items: ${needsAttentionTotal}`);

  if (totalIssues > 0) process.exit(1);
}

main();
