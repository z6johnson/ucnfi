"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AiRelationship,
  CommitteeMember,
  Confidence,
  Facet,
} from "@/lib/committee";
import { MemberDrawer } from "@/components/MemberDrawer";

type FacetKey = "rel" | "tag";

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
  aiRelationshipFacets: Facet<AiRelationship>[];
};

export function ExpertiseMatrix({
  members,
  expertiseTagFacets,
  aiRelationshipFacets,
}: Props) {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [rels, setRels] = useState<Set<AiRelationship>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openFacet === null) return;
    const onMouseDown = (e: MouseEvent) => {
      const root = filterBarRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setOpenFacet(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFacet(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openFacet]);

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
      if (rels.size > 0) {
        const list = m.enrichment.role_facets?.ai_relationship ?? [];
        if (!list.some((r) => rels.has(r))) return false;
      }
      return true;
    });
  }, [members, query, tags, rels]);

  const anyFilter =
    query.length > 0 || tags.size > 0 || rels.size > 0;

  const clearAll = () => {
    setQuery("");
    setTags(new Set());
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

      {/* ---------- Filters (horizontal trigger row + shared panel) ---------- */}
      <section className="mt-6" ref={filterBarRef}>
        <div className="hairline flex items-baseline justify-between pb-2">
          <span className="label">Filters</span>
          {anyFilter ? (
            <button
              type="button"
              onClick={clearAll}
              className="label"
              style={{ color: "var(--color-accent)", cursor: "pointer" }}
            >
              Clear all
            </button>
          ) : (
            <span className="label">No filters — all members shown</span>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row">
          <FilterTrigger
            label="AI relationship"
            sublabel={`${aiRelationshipFacets.length} types`}
            selectedCount={rels.size}
            open={openFacet === "rel"}
            onClick={() =>
              setOpenFacet((cur) => (cur === "rel" ? null : "rel"))
            }
          />
          <FilterTrigger
            label="Expertise"
            sublabel={`${expertiseTagFacets.length} tags`}
            selectedCount={tags.size}
            open={openFacet === "tag"}
            onClick={() =>
              setOpenFacet((cur) => (cur === "tag" ? null : "tag"))
            }
          />
        </div>
        {openFacet === "rel" ? (
          <FilterPanel
            label="AI relationship"
            items={aiRelationshipFacets}
            selected={rels}
            onToggle={(id) => toggle(setRels, id)}
            onClose={() => setOpenFacet(null)}
          />
        ) : openFacet === "tag" ? (
          <FilterPanel
            label="Expertise"
            items={expertiseTagFacets}
            selected={tags}
            onToggle={(id) => toggle(setTags, id)}
            onClose={() => setOpenFacet(null)}
          />
        ) : null}
      </section>

      {/* ---------- Results ---------- */}
      <section className="mt-8">
        <div className="hairline flex flex-wrap items-baseline justify-between gap-4 pb-2">
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
                <MemberCard
                  member={m}
                  onOpen={() => setSelectedId(m.member_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <MemberDrawer
        memberId={selectedId}
        members={members}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Filter trigger — one of four buttons in the FilterBar trigger row   */
/* ------------------------------------------------------------------ */

type FilterTriggerProps = {
  label: string;
  sublabel: string;
  selectedCount: number;
  open: boolean;
  onClick: () => void;
};

function FilterTrigger({
  label,
  sublabel,
  selectedCount,
  open,
  onClick,
}: FilterTriggerProps) {
  const hasSelection = selectedCount > 0;
  const borderColor =
    open || hasSelection
      ? "var(--color-accent)"
      : "var(--color-border-hair)";
  const background = open ? "var(--color-accent-wash)" : "transparent";
  const labelColor =
    open || hasSelection ? "var(--color-accent)" : "var(--color-text)";
  const summaryColor =
    open || hasSelection
      ? "var(--color-accent)"
      : "var(--color-text-subtle)";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="true"
      className="md:flex-1"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0.55rem 0.75rem",
        border: `1px solid ${borderColor}`,
        background,
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span className="flex items-baseline gap-2 min-w-0">
        <span
          className="label"
          style={{
            color: labelColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
        {hasSelection ? (
          <span
            className="label"
            style={{
              padding: "0.05rem 0.35rem",
              background: "var(--color-accent)",
              color: "var(--color-bg)",
              fontWeight: 700,
              borderRadius: "2px",
            }}
          >
            {selectedCount}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-2">
        <span
          className="label"
          style={{
            color: summaryColor,
            whiteSpace: "nowrap",
            opacity: hasSelection ? 0 : 1,
          }}
          aria-hidden={hasSelection}
        >
          {sublabel}
        </span>
        <span
          aria-hidden
          style={{
            color: summaryColor,
            fontSize: "0.7rem",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform 120ms ease",
          }}
        >
          ▾
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Filter panel — shared expansion area below the trigger row          */
/* ------------------------------------------------------------------ */

type FilterPanelProps<T extends string> = {
  label: string;
  items: Facet<T>[];
  selected: Set<T>;
  onToggle: (id: T) => void;
  onClose: () => void;
};

function FilterPanel<T extends string>({
  label,
  items,
  selected,
  onToggle,
  onClose,
}: FilterPanelProps<T>) {
  if (items.length === 0) return null;
  const hasSelection = selected.size > 0;
  return (
    <div
      role="region"
      aria-label={`${label} filter`}
      className="mt-3 p-4"
      style={{
        border: "1px solid var(--color-border-hair)",
        background: "var(--color-bg)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <button
          type="button"
          onClick={onClose}
          className="label"
          style={{ color: "var(--color-accent)", cursor: "pointer" }}
        >
          Done
        </button>
      </div>
      <p
        className="mt-2 text-xs"
        style={{ color: "var(--color-text-subtle)", lineHeight: 1.45 }}
        aria-live="polite"
      >
        {hasSelection
          ? `Filtering to members matching any of the ${selected.size} selected ${
              selected.size === 1 ? "chip" : "chips"
            }. Tap a chip to remove it, or “Clear all” above to reset.`
          : "No filter applied — all members are shown by default. Tap any chip below to narrow the list."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Member card                                                         */
/* ------------------------------------------------------------------ */

function MemberCard({
  member,
  onOpen,
}: {
  member: CommitteeMember;
  onOpen: () => void;
}) {
  const displayName = member.name.preferred ?? member.name.full;
  const tags = member.enrichment.expertise_tags ?? [];
  const synopsis = member.enrichment.synopsis;
  const synopsisShort =
    synopsis.length > 280 ? synopsis.slice(0, 277) + "…" : synopsis;
  const role = member.committee_role.role;
  const roleLabel = COMMITTEE_ROLE_LABEL[role] ?? role;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open profile for ${displayName}`}
      className="flex h-full flex-col gap-3 p-5"
      style={{
        border: "1px solid var(--color-border-hair)",
        background: "var(--color-bg)",
        cursor: "pointer",
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

      <div
        className="mt-auto flex items-center justify-between gap-3 pt-2"
        style={{ flexWrap: "wrap" }}
      >
        <span
          className="label"
          style={{ color: "var(--color-accent)" }}
          aria-hidden
        >
          Open profile →
        </span>
        <FreshnessBadge member={member} />
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Freshness badge                                                     */
/* ------------------------------------------------------------------ */

const STALE_DAYS = 90;

function daysSince(isoDate: string): number | null {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

function FreshnessBadge({ member }: { member: CommitteeMember }) {
  const last = member.record_meta.last_verified;
  const days = daysSince(last);
  const stale = days !== null && days >= STALE_DAYS;

  return (
    <div
      className="flex items-center gap-3 text-xs"
      style={{ color: "var(--color-text-subtle)" }}
    >
      <span
        title={`Last verified ${last}${
          days !== null ? ` · ${days} day${days === 1 ? "" : "s"} ago` : ""
        }`}
        style={{
          color: stale ? "var(--color-warn-strong)" : "var(--color-text-subtle)",
        }}
      >
        {stale ? "Stale · " : "Verified "}
        {last}
      </span>
    </div>
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
