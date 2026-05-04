"use client";

import { useMemo, useState } from "react";
import type {
  AiRelationship,
  CommitteeMember,
  Confidence,
  Facet,
  OpportunityAreaId,
  Sector,
} from "@/lib/committee";

/* ------------------------------------------------------------------ */
/* Display constants — duplicated to keep server-only `lib/committee`  */
/* out of the client bundle.                                            */
/* ------------------------------------------------------------------ */

const COMMITTEE_ROLE_LABEL: Record<string, string> = {
  co_chair: "Co-chair",
  special_advisor: "Special advisor",
  member: "Member",
  advisory_board: "Advisory board",
  support_team: "Support team",
  student_member: "Student member",
};

const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "var(--color-accent)",
  medium: "var(--color-info)",
  low: "var(--color-text-subtle)",
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type Props = {
  members: CommitteeMember[];
  expertiseTagFacets: Facet<string>[];
  opportunityAreaFacets: Facet<OpportunityAreaId>[];
  sectorFacets: Facet<Sector>[];
  aiRelationshipFacets: Facet<AiRelationship>[];
};

export function ExpertiseMatrix({
  members,
  expertiseTagFacets,
  opportunityAreaFacets,
  sectorFacets,
  aiRelationshipFacets,
}: Props) {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [oas, setOas] = useState<Set<OpportunityAreaId>>(new Set());
  const [sectors, setSectors] = useState<Set<Sector>>(new Set());
  const [rels, setRels] = useState<Set<AiRelationship>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      // Text search across name, affiliation, tags, synopsis, evidence.
      if (q.length > 0) {
        const haystack = [
          m.name.full,
          m.name.preferred ?? "",
          m.primary_affiliation.organization,
          m.primary_affiliation.title,
          m.primary_affiliation.department ?? "",
          m.enrichment.synopsis,
          ...m.enrichment.expertise_tags.flatMap((t) => [
            t.tag,
            t.evidence ?? "",
          ]),
          ...(m.committee_role.represents ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (tags.size > 0) {
        const has = m.enrichment.expertise_tags.some((t) => tags.has(t.tag));
        if (!has) return false;
      }
      if (oas.size > 0) {
        const has = (m.enrichment.opportunity_areas ?? []).some((o) =>
          oas.has(o.oa),
        );
        if (!has) return false;
      }
      if (sectors.size > 0) {
        const s = m.enrichment.role_facets?.sector;
        if (!s || !sectors.has(s)) return false;
      }
      if (rels.size > 0) {
        const list = m.enrichment.role_facets?.ai_relationship ?? [];
        if (!list.some((r) => rels.has(r))) return false;
      }
      return true;
    });
  }, [members, query, tags, oas, sectors, rels]);

  const anyFilter =
    query.length > 0 ||
    tags.size > 0 ||
    oas.size > 0 ||
    sectors.size > 0 ||
    rels.size > 0;

  const clearAll = () => {
    setQuery("");
    setTags(new Set());
    setOas(new Set());
    setSectors(new Set());
    setRels(new Set());
  };

  return (
    <div>
      {/* ---------- Search ---------- */}
      <section>
        <div className="hairline flex items-baseline justify-between pb-2">
          <span className="label">Search</span>
          <span className="label">
            {filtered.length} of {members.length} shown
          </span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, affiliation, expertise, evidence…"
          className="ucnfi-input mt-3"
          aria-label="Search committee members"
        />
      </section>

      {/* ---------- Opportunity area picker ---------- */}
      <FacetGroup
        label="Opportunity area"
        sublabel={`${opportunityAreaFacets.length} total`}
        items={opportunityAreaFacets}
        selected={oas}
        onToggle={(id) => toggle(setOas, id)}
      />

      {/* ---------- Sector picker ---------- */}
      <FacetGroup
        label="Sector"
        items={sectorFacets}
        selected={sectors}
        onToggle={(id) => toggle(setSectors, id)}
      />

      {/* ---------- AI relationship picker ---------- */}
      <FacetGroup
        label="AI relationship"
        items={aiRelationshipFacets}
        selected={rels}
        onToggle={(id) => toggle(setRels, id)}
      />

      {/* ---------- Expertise tag picker ---------- */}
      <FacetGroup
        label="Expertise"
        sublabel={`${expertiseTagFacets.length} tags`}
        items={expertiseTagFacets}
        selected={tags}
        onToggle={(id) => toggle(setTags, id)}
      />

      {/* ---------- Active-filter row ---------- */}
      {anyFilter ? (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={clearAll}
            className="label"
            style={{ color: "var(--color-accent)", cursor: "pointer" }}
          >
            Clear all filters
          </button>
        </div>
      ) : null}

      {/* ---------- Results ---------- */}
      <section className="mt-12">
        <div className="hairline flex items-baseline justify-between pb-2">
          <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
            Members
          </h2>
          <span className="label">
            {filtered.length} {filtered.length === 1 ? "member" : "members"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState label="No committee members match the current filters. Try widening the search or clearing a facet." />
        ) : (
          <ul className="mt-6 grid gap-6 md:grid-cols-2">
            {filtered.map((m) => (
              <li key={m.member_id}>
                <MemberCard member={m} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Facet group — reusable filter pill row                              */
/* ------------------------------------------------------------------ */

type FacetGroupProps<T extends string> = {
  label: string;
  sublabel?: string;
  items: Facet<T>[];
  selected: Set<T>;
  onToggle: (id: T) => void;
};

function FacetGroup<T extends string>({
  label,
  sublabel,
  items,
  selected,
  onToggle,
}: FacetGroupProps<T>) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="hairline flex items-baseline justify-between pb-2">
        <span className="label">{label}</span>
        {sublabel ? <span className="label">{sublabel}</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((it) => {
          const active = selected.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className="label"
              style={{
                padding: "0.4rem 0.65rem",
                border: `1px solid ${
                  active
                    ? "var(--color-accent)"
                    : "var(--color-border-hair)"
                }`,
                background: active
                  ? "var(--color-accent-wash)"
                  : "transparent",
                color: active
                  ? "var(--color-accent)"
                  : "var(--color-text-subtle)",
                cursor: "pointer",
                textAlign: "left",
              }}
              aria-pressed={active}
            >
              {it.label}
              <span
                style={{
                  marginLeft: "0.5rem",
                  opacity: 0.7,
                  fontWeight: 500,
                }}
              >
                {it.count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Member card                                                         */
/* ------------------------------------------------------------------ */

const OPPORTUNITY_AREA_LABEL: Record<OpportunityAreaId, string> = {
  "OA-1": "Trusted AI Standard",
  "OA-2": "Strategic Expansion / Partnerships",
  "OA-3": "National AI Literacy",
  "OA-4": "AI Infrastructure",
  "OA-5": "Operational Streamlining",
  "OA-6": "21st Century Public University",
  "OA-7": "Grand Challenges",
  "OA-8": "360° Health Intelligence",
};

function MemberCard({ member }: { member: CommitteeMember }) {
  const displayName = member.name.preferred ?? member.name.full;
  const oas = member.enrichment.opportunity_areas ?? [];
  const tags = member.enrichment.expertise_tags ?? [];
  const synopsis = member.enrichment.synopsis;
  const synopsisShort =
    synopsis.length > 280 ? synopsis.slice(0, 277) + "…" : synopsis;
  const role = member.committee_role.role;
  const roleLabel = COMMITTEE_ROLE_LABEL[role] ?? role;

  return (
    <article
      className="flex h-full flex-col gap-3 p-5"
      style={{
        border: "1px solid var(--color-border-hair)",
        background: "var(--color-bg)",
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3
            className="display"
            style={{
              fontSize: "var(--text-lg)",
              lineHeight: 1.15,
            }}
          >
            {displayName}
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            {member.primary_affiliation.title}
          </p>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-subtle)" }}
          >
            {member.primary_affiliation.organization}
          </p>
        </div>
        {role !== "member" ? (
          <span
            className="label"
            style={{
              color: "var(--color-accent)",
              whiteSpace: "nowrap",
            }}
          >
            {roleLabel}
          </span>
        ) : null}
      </header>

      {oas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {oas.map((o) => (
            <span
              key={o.oa}
              title={`${o.oa} · ${OPPORTUNITY_AREA_LABEL[o.oa]} (${o.relevance})`}
              className="label"
              style={{
                padding: "0.15rem 0.4rem",
                color:
                  o.relevance === "primary"
                    ? "var(--color-accent)"
                    : "var(--color-text-subtle)",
                background:
                  o.relevance === "primary"
                    ? "var(--color-accent-wash)"
                    : "transparent",
                border:
                  o.relevance === "primary"
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border-hair)",
              }}
            >
              {o.oa}
            </span>
          ))}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {tags.map((t) => (
            <li
              key={t.tag}
              className="flex items-baseline gap-2 text-sm"
              style={{ color: "var(--color-text)" }}
            >
              <span
                aria-hidden
                style={{
                  color: CONFIDENCE_TONE[t.confidence],
                  fontSize: "0.6rem",
                  lineHeight: 1,
                }}
              >
                ●
              </span>
              <span>{t.tag}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p
        className="text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        {synopsisShort}
      </p>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function toggle<T>(
  setter: React.Dispatch<React.SetStateAction<Set<T>>>,
  id: T,
) {
  setter((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="rail-accent mt-6 max-w-xl"
      style={{ borderLeftColor: "var(--color-border-hair)" }}
    >
      <p
        className="text-sm"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </p>
    </div>
  );
}
