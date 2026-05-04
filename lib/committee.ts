/**
 * Committee member loader for the UCNFI Steering Committee directory.
 *
 * Server-only. Reads every JSON file in
 * `data/ucnfi-committee/records/` once on first import and exposes
 * typed accessors over the set. Mirrors the shape of `lib/baseline.ts`
 * so pages stay consistent.
 *
 * Schema source of truth: `data/ucnfi-committee/schema/member.schema.json`.
 * If the schema changes, update the types in this file in lockstep.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Types — derived from schema/member.schema.json                      */
/* ------------------------------------------------------------------ */

export type Sector =
  | "uc_campus"
  | "ucop"
  | "uc_health"
  | "national_lab"
  | "industry"
  | "state_government"
  | "nonprofit_or_network"
  | "venture_capital"
  | "other";

export type AiRelationship =
  | "builder_or_researcher"
  | "deployer_or_operator"
  | "governor_or_policy"
  | "critic_or_scholar"
  | "investor_or_market"
  | "user_representative";

export type GovernanceOrientation =
  | "academic_senate"
  | "campus_administration"
  | "system_administration"
  | "health_system"
  | "state_policy"
  | "industry_standards"
  | "research_integrity"
  | "student_affairs";

export type CommitteeRoleId =
  | "co_chair"
  | "special_advisor"
  | "member"
  | "advisory_board"
  | "support_team"
  | "student_member";

export type OpportunityAreaId =
  | "OA-1"
  | "OA-2"
  | "OA-3"
  | "OA-4"
  | "OA-5"
  | "OA-6"
  | "OA-7"
  | "OA-8";

export type Confidence = "high" | "medium" | "low";

export type ExpertiseTag = {
  tag: string;
  confidence: Confidence;
  evidence?: string;
};

export type OpportunityAreaMapping = {
  oa: OpportunityAreaId;
  relevance: "primary" | "secondary";
  rationale?: string;
};

export type Source = {
  url: string;
  type: string;
  accessed: string;
  note?: string;
};

export type CommitteeMember = {
  member_id: string;
  name: {
    full: string;
    first?: string;
    last?: string;
    preferred?: string;
    pronouns?: string;
  };
  primary_affiliation: {
    organization: string;
    title: string;
    campus_or_unit?: string;
    department?: string;
  };
  secondary_affiliations?: Array<{
    organization: string;
    role: string;
    type?: string;
    active?: boolean;
  }>;
  committee_role: {
    role: CommitteeRoleId;
    represents?: string[];
  };
  enrichment: {
    expertise_tags: ExpertiseTag[];
    opportunity_areas?: OpportunityAreaMapping[];
    role_facets?: {
      sector?: Sector;
      ai_relationship?: AiRelationship[];
      governance_orientation?: GovernanceOrientation[];
    };
    synopsis: string;
    sources: Source[];
  };
  self_report?: {
    submitted?: boolean;
  };
  record_meta: {
    created: string;
    last_verified: string;
    schema_version: string;
    enrichment_pass?: string;
    needs_attention?: string[];
  };
};

/* ------------------------------------------------------------------ */
/* Load                                                                */
/* ------------------------------------------------------------------ */

const RECORDS_DIR = join(
  process.cwd(),
  "data",
  "ucnfi-committee",
  "records",
);

const records: CommitteeMember[] = (() => {
  const files = readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const raw = readFileSync(join(RECORDS_DIR, f), "utf-8");
    return JSON.parse(raw) as CommitteeMember;
  });
})();

/* ------------------------------------------------------------------ */
/* Accessors                                                           */
/* ------------------------------------------------------------------ */

const ROLE_ORDER: Record<CommitteeRoleId, number> = {
  co_chair: 0,
  special_advisor: 1,
  member: 2,
  advisory_board: 3,
  support_team: 4,
  student_member: 5,
};

/** All members, sorted: co-chairs and advisors first, then alphabetical by last name. */
export function listMembers(): CommitteeMember[] {
  return [...records].sort((a, b) => {
    const ar = ROLE_ORDER[a.committee_role.role] ?? 99;
    const br = ROLE_ORDER[b.committee_role.role] ?? 99;
    if (ar !== br) return ar - br;
    const al = (a.name.last ?? a.name.full).toLowerCase();
    const bl = (b.name.last ?? b.name.full).toLowerCase();
    return al.localeCompare(bl);
  });
}

export function getMember(id: string): CommitteeMember | undefined {
  return records.find((m) => m.member_id === id);
}

export function memberIds(): string[] {
  return records.map((m) => m.member_id);
}

/**
 * Compact text summary of every member, suitable for inlining into a
 * system prompt. Drops evidence and source URLs to keep the cached
 * block small; the full record is still available at runtime via
 * `getMember()` and the `/api/member/[id]` route.
 */
export function committeeContextSummary(): string {
  const lines: string[] = [];
  for (const m of listMembers()) {
    const role = COMMITTEE_ROLE_LABEL[m.committee_role.role];
    const oas = (m.enrichment.opportunity_areas ?? [])
      .map((o) => `${o.oa}/${o.relevance}`)
      .join(", ");
    const tags = (m.enrichment.expertise_tags ?? [])
      .map((t) => `${t.tag} (${t.confidence})`)
      .join("; ");
    const facets = m.enrichment.role_facets;
    const facetParts: string[] = [];
    if (facets?.sector) facetParts.push(`sector=${facets.sector}`);
    if (facets?.ai_relationship && facets.ai_relationship.length > 0) {
      facetParts.push(`ai=${facets.ai_relationship.join("|")}`);
    }
    if (
      facets?.governance_orientation &&
      facets.governance_orientation.length > 0
    ) {
      facetParts.push(`gov=${facets.governance_orientation.join("|")}`);
    }
    const display = m.name.preferred ?? m.name.full;
    lines.push(
      `[${m.member_id}] ${display} — ${role}, ${m.primary_affiliation.title}, ${m.primary_affiliation.organization}.`,
    );
    if (oas) lines.push(`  OAs: ${oas}`);
    if (tags) lines.push(`  Expertise: ${tags}`);
    if (facetParts.length > 0) lines.push(`  Facets: ${facetParts.join(", ")}`);
    lines.push(`  Synopsis: ${m.enrichment.synopsis}`);
    lines.push("");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Facets — for filter pickers                                         */
/* ------------------------------------------------------------------ */

export type Facet<T extends string> = { id: T; label: string; count: number };

export function listExpertiseTagFacets(): Facet<string>[] {
  const counts = new Map<string, number>();
  for (const m of records) {
    for (const t of m.enrichment.expertise_tags ?? []) {
      counts.set(t.tag, (counts.get(t.tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function listOpportunityAreaFacets(): Facet<OpportunityAreaId>[] {
  const counts = new Map<OpportunityAreaId, number>();
  for (const oa of OPPORTUNITY_AREA_IDS) counts.set(oa, 0);
  for (const m of records) {
    for (const o of m.enrichment.opportunity_areas ?? []) {
      counts.set(o.oa, (counts.get(o.oa) ?? 0) + 1);
    }
  }
  return OPPORTUNITY_AREA_IDS.map((id) => ({
    id,
    label: `${id} ${OPPORTUNITY_AREA_LABEL[id]}`,
    count: counts.get(id) ?? 0,
  }));
}

export function listSectorFacets(): Facet<Sector>[] {
  const counts = new Map<Sector, number>();
  for (const m of records) {
    const s = m.enrichment.role_facets?.sector;
    if (!s) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, label: SECTOR_LABEL[id], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function listAiRelationshipFacets(): Facet<AiRelationship>[] {
  const counts = new Map<AiRelationship, number>();
  for (const m of records) {
    for (const r of m.enrichment.role_facets?.ai_relationship ?? []) {
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({
      id,
      label: AI_RELATIONSHIP_LABEL[id],
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------------ */
/* Display labels                                                      */
/* ------------------------------------------------------------------ */

export const OPPORTUNITY_AREA_IDS: OpportunityAreaId[] = [
  "OA-1",
  "OA-2",
  "OA-3",
  "OA-4",
  "OA-5",
  "OA-6",
  "OA-7",
  "OA-8",
];

/** Short labels — derived from `summary/pass1-aggregate-summary.md`. */
export const OPPORTUNITY_AREA_LABEL: Record<OpportunityAreaId, string> = {
  "OA-1": "Trusted AI Standard",
  "OA-2": "Strategic Expansion / Partnerships",
  "OA-3": "National AI Literacy",
  "OA-4": "AI Infrastructure",
  "OA-5": "Operational Streamlining",
  "OA-6": "21st Century Public University",
  "OA-7": "Grand Challenges",
  "OA-8": "360° Health Intelligence",
};

export const SECTOR_LABEL: Record<Sector, string> = {
  uc_campus: "UC campus",
  ucop: "UCOP",
  uc_health: "UC Health",
  national_lab: "National lab",
  industry: "Industry",
  state_government: "State government",
  nonprofit_or_network: "Nonprofit / network",
  venture_capital: "Venture capital",
  other: "Other",
};

export const AI_RELATIONSHIP_LABEL: Record<AiRelationship, string> = {
  builder_or_researcher: "Builder / researcher",
  deployer_or_operator: "Deployer / operator",
  governor_or_policy: "Governor / policy",
  critic_or_scholar: "Critic / scholar",
  investor_or_market: "Investor / market",
  user_representative: "User representative",
};

export const COMMITTEE_ROLE_LABEL: Record<CommitteeRoleId, string> = {
  co_chair: "Co-chair",
  special_advisor: "Special advisor",
  member: "Member",
  advisory_board: "Advisory board",
  support_team: "Support team",
  student_member: "Student member",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
