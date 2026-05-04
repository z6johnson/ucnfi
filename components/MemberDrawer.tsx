"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AiRelationship,
  CommitteeMember,
  Confidence,
  GovernanceOrientation,
  OpportunityAreaId,
  Sector,
} from "@/lib/committee";

/* ------------------------------------------------------------------ */
/* Display labels — duplicated from `lib/committee` to keep that       */
/* server-only module out of the client bundle.                         */
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

const SECTOR_LABEL: Record<Sector, string> = {
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

const AI_RELATIONSHIP_LABEL: Record<AiRelationship, string> = {
  builder_or_researcher: "Builder / researcher",
  deployer_or_operator: "Deployer / operator",
  governor_or_policy: "Governor / policy",
  critic_or_scholar: "Critic / scholar",
  investor_or_market: "Investor / market",
  user_representative: "User representative",
};

const GOVERNANCE_ORIENTATION_LABEL: Record<GovernanceOrientation, string> = {
  academic_senate: "Academic senate",
  campus_administration: "Campus administration",
  system_administration: "System administration",
  health_system: "Health system",
  state_policy: "State policy",
  industry_standards: "Industry standards",
  research_integrity: "Research integrity",
  student_affairs: "Student affairs",
};

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

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type Props = {
  memberId: string | null;
  /**
   * Optional in-memory lookup pool. When provided and the id matches,
   * the drawer skips the network and renders directly. Pages that
   * already loaded the full member set server-side (like /expertise)
   * pass this; the chat page does not, and the drawer fetches.
   */
  members?: CommitteeMember[];
  onClose: () => void;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; data: CommitteeMember }
  | { status: "error"; id: string; message: string };

export function MemberDrawer({ memberId, members, onClose }: Props) {
  // Close on Escape.
  useEffect(() => {
    if (!memberId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [memberId, onClose]);

  const inMemory = useMemo(() => {
    if (!memberId || !members) return null;
    return members.find((m) => m.member_id === memberId) ?? null;
  }, [memberId, members]);

  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [cache, setCache] = useState<Record<string, CommitteeMember>>({});

  useEffect(() => {
    if (!memberId || inMemory) return;
    if (cache[memberId]) {
      setFetchState({ status: "ready", id: memberId, data: cache[memberId] });
      return;
    }
    let cancelled = false;
    setFetchState({ status: "loading", id: memberId });
    fetch(`/api/member/${encodeURIComponent(memberId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`);
        return (await res.json()) as CommitteeMember;
      })
      .then((data) => {
        if (cancelled) return;
        setCache((c) => ({ ...c, [memberId]: data }));
        setFetchState({ status: "ready", id: memberId, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchState({
          status: "error",
          id: memberId,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [memberId, inMemory, cache]);

  if (!memberId) return null;

  const member: CommitteeMember | null =
    inMemory ??
    (fetchState.status === "ready" ? fetchState.data : null);

  if (!member) {
    return (
      <div
        className="fixed inset-0 z-40 flex justify-end"
        aria-modal="true"
        role="dialog"
        aria-label="Member detail"
      >
        <button
          type="button"
          aria-label="Close member detail"
          onClick={onClose}
          className="absolute inset-0"
          style={{ background: "rgba(0, 32, 51, 0.28)", cursor: "pointer" }}
        />
        <aside
          className="relative flex h-full w-full max-w-[560px] flex-col px-8 py-8 shadow-xl md:px-10"
          style={{
            background: "var(--color-bg)",
            borderLeft: "1px solid var(--color-border-hair)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <span className="label">Committee member</span>
            <button
              type="button"
              onClick={onClose}
              className="label"
              style={{ color: "var(--color-text-subtle)", cursor: "pointer" }}
            >
              Close ✕
            </button>
          </div>
          {fetchState.status === "loading" ? (
            <p
              className="label mt-6"
              style={{ color: "var(--color-text-subtle)" }}
            >
              Loading {fetchState.id}…
            </p>
          ) : fetchState.status === "error" ? (
            <div
              className="rail-accent mt-6"
              style={{ borderLeftColor: "var(--color-danger)" }}
            >
              <span className="label" style={{ color: "var(--color-danger)" }}>
                Error
              </span>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {fetchState.message}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    );
  }

  const displayName = member.name.preferred ?? member.name.full;
  const roleLabel =
    COMMITTEE_ROLE_LABEL[member.committee_role.role] ??
    member.committee_role.role;
  const facets = member.enrichment.role_facets;
  const oas = member.enrichment.opportunity_areas ?? [];
  const tags = member.enrichment.expertise_tags ?? [];
  const sources = member.enrichment.sources ?? [];
  const secondary = member.secondary_affiliations ?? [];
  const represents = member.committee_role.represents ?? [];
  const selfReportSubmitted = member.self_report?.submitted === true;
  const needsAttention = member.record_meta.needs_attention ?? [];

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      aria-modal="true"
      role="dialog"
      aria-label={`${displayName} detail`}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close member detail"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(0, 32, 51, 0.28)", cursor: "pointer" }}
      />

      {/* Panel */}
      <aside
        className="relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto px-8 py-8 shadow-xl md:px-10"
        style={{
          background: "var(--color-bg)",
          borderLeft: "1px solid var(--color-border-hair)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="label">{roleLabel}</span>
          <button
            type="button"
            onClick={onClose}
            className="label"
            style={{ color: "var(--color-text-subtle)", cursor: "pointer" }}
          >
            Close ✕
          </button>
        </div>

        <h2 className="display mt-3">{displayName}</h2>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-text)" }}
        >
          {member.primary_affiliation.title}
        </p>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-subtle)" }}
        >
          {member.primary_affiliation.organization}
          {member.primary_affiliation.department
            ? ` · ${member.primary_affiliation.department}`
            : ""}
        </p>

        {/* ---------- Synopsis ---------- */}
        <section className="mt-8">
          <header className="hairline pb-2">
            <span className="label">Synopsis</span>
          </header>
          <p
            className="prose-body mt-3"
            style={{ color: "var(--color-text)" }}
          >
            {member.enrichment.synopsis}
          </p>
        </section>

        {/* ---------- Opportunity areas ---------- */}
        {oas.length > 0 ? (
          <section className="mt-8">
            <header className="hairline flex items-baseline justify-between pb-2">
              <span className="label">Opportunity areas</span>
              <span className="label">{oas.length}</span>
            </header>
            <ul className="mt-3 flex flex-col gap-3">
              {oas.map((o) => (
                <li
                  key={o.oa}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-baseline gap-2">
                    <span
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
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {OPPORTUNITY_AREA_LABEL[o.oa]}
                    </span>
                    <span
                      className="label"
                      style={{ color: "var(--color-text-subtle)" }}
                    >
                      {o.relevance}
                    </span>
                  </div>
                  {o.rationale ? (
                    <p
                      className="text-sm"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {o.rationale}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---------- Expertise tags ---------- */}
        {tags.length > 0 ? (
          <section className="mt-8">
            <header className="hairline flex items-baseline justify-between pb-2">
              <span className="label">Expertise</span>
              <span className="label">{tags.length}</span>
            </header>
            <ul className="mt-3 flex flex-col gap-4">
              {tags.map((t) => (
                <li
                  key={t.tag}
                  className="flex flex-col gap-1"
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      style={{
                        color: CONFIDENCE_TONE[t.confidence],
                        fontSize: "0.65rem",
                        lineHeight: 1,
                      }}
                    >
                      ●
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--color-ink)" }}
                    >
                      {t.tag}
                    </span>
                    <span
                      className="label"
                      style={{ color: CONFIDENCE_TONE[t.confidence] }}
                    >
                      {CONFIDENCE_LABEL[t.confidence]}
                    </span>
                  </div>
                  {t.evidence ? (
                    <p
                      className="text-sm"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {t.evidence}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---------- Role facets ---------- */}
        {facets &&
        (facets.sector ||
          (facets.ai_relationship && facets.ai_relationship.length > 0) ||
          (facets.governance_orientation &&
            facets.governance_orientation.length > 0)) ? (
          <section className="mt-8">
            <header className="hairline pb-2">
              <span className="label">Role facets</span>
            </header>
            <dl className="mt-3 flex flex-col gap-3 text-sm">
              {facets.sector ? (
                <FacetRow
                  label="Sector"
                  value={SECTOR_LABEL[facets.sector]}
                />
              ) : null}
              {facets.ai_relationship && facets.ai_relationship.length > 0 ? (
                <FacetRow
                  label="AI relationship"
                  value={facets.ai_relationship
                    .map((r) => AI_RELATIONSHIP_LABEL[r])
                    .join(", ")}
                />
              ) : null}
              {facets.governance_orientation &&
              facets.governance_orientation.length > 0 ? (
                <FacetRow
                  label="Governance"
                  value={facets.governance_orientation
                    .map((g) => GOVERNANCE_ORIENTATION_LABEL[g])
                    .join(", ")}
                />
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* ---------- Represents ---------- */}
        {represents.length > 0 ? (
          <section className="mt-8">
            <header className="hairline pb-2">
              <span className="label">Brings to the committee</span>
            </header>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {represents.map((r) => (
                <li
                  key={r}
                  style={{ color: "var(--color-text)" }}
                >
                  {r}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---------- Secondary affiliations ---------- */}
        {secondary.length > 0 ? (
          <section className="mt-8">
            <header className="hairline flex items-baseline justify-between pb-2">
              <span className="label">Other affiliations</span>
              <span className="label">{secondary.length}</span>
            </header>
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {secondary.map((s, i) => (
                <li
                  key={`${s.organization}-${i}`}
                  className="flex flex-col"
                >
                  <span
                    className="font-semibold"
                    style={{
                      color: s.active === false
                        ? "var(--color-text-subtle)"
                        : "var(--color-ink)",
                    }}
                  >
                    {s.organization}
                  </span>
                  <span
                    style={{
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {s.role}
                    {s.active === false ? " (past)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---------- Sources ---------- */}
        {sources.length > 0 ? (
          <section className="mt-8">
            <header className="hairline flex items-baseline justify-between pb-2">
              <span className="label">Sources</span>
              <span className="label">{sources.length}</span>
            </header>
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {sources.map((s, i) => {
                const isLink = s.url.startsWith("http");
                return (
                  <li
                    key={`${s.url}-${i}`}
                    className="flex flex-col"
                  >
                    {isLink ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-semibold"
                      >
                        {s.url} ↗
                      </a>
                    ) : (
                      <span
                        className="font-semibold"
                        style={{ color: "var(--color-text-subtle)" }}
                      >
                        {s.url}
                      </span>
                    )}
                    <span
                      className="label"
                      style={{ marginTop: "0.125rem" }}
                    >
                      {s.type.replace(/_/g, " ")} · accessed {s.accessed}
                    </span>
                    {s.note ? (
                      <span
                        style={{
                          color: "var(--color-text-muted)",
                          marginTop: "0.25rem",
                        }}
                      >
                        {s.note}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* ---------- Provenance footer ---------- */}
        <section className="mt-10">
          <div
            className="hairline pt-4 text-xs"
            style={{ color: "var(--color-text-subtle)" }}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Last verified {member.record_meta.last_verified}</span>
              <span aria-hidden>·</span>
              <span>Schema {member.record_meta.schema_version}</span>
              {member.record_meta.enrichment_pass ? (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {member.record_meta.enrichment_pass.replace(/_/g, " ")}
                  </span>
                </>
              ) : null}
              <span aria-hidden>·</span>
              <span>
                Self-report:{" "}
                {selfReportSubmitted ? "submitted" : "not yet submitted"}
              </span>
            </div>
            {needsAttention.length > 0 ? (
              <div className="mt-3">
                <span className="label">Needs attention</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {needsAttention.map((n, i) => (
                    <li
                      key={i}
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </aside>
    </div>
  );
}

function FacetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="label">{label}</dt>
      <dd
        className="mt-1"
        style={{ color: "var(--color-text)" }}
      >
        {value}
      </dd>
    </div>
  );
}
