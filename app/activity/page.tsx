import Link from "next/link";

import {
  type ActivityItem,
  type ActivityScope,
  type ActivitySourceKind,
  type ActivityTier,
  COMMITTEE_SCOPE_ID,
  isoDateUTC,
  lastNDates,
  listDigestWeeks,
  listItemDates,
  readItemsForDates,
  scopeOf,
} from "@/lib/activity";
import { listMembers } from "@/lib/committee";
import { isFresh, windowBounds } from "@/lib/brief/recency";

export const metadata = {
  title: "Activity — UCNFI",
  description:
    "Daily AI-activity scan of UCNFI Steering Committee members and the committee itself.",
};

/* ------------------------------------------------------------------ */
/* URL params                                                          */
/* ------------------------------------------------------------------ */

type ScopeFilter = "all" | ActivityScope;
type DaysFilter = "7" | "30" | "all";
type TierFilter = "all" | "1" | "2";
type SourceFilter = "all" | ActivitySourceKind;

type Filters = {
  scope: ScopeFilter;
  days: DaysFilter;
  tier: TierFilter;
  source: SourceFilter;
};

const DEFAULT_FILTERS: Filters = {
  scope: "all",
  days: "7",
  tier: "all",
  source: "all",
};

function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const pick = (k: keyof Filters): string | undefined => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const scope = pick("scope");
  const days = pick("days");
  const tier = pick("tier");
  const source = pick("source");
  return {
    scope: scope === "member" || scope === "committee" ? scope : "all",
    days: days === "30" || days === "all" ? days : "7",
    tier: tier === "1" || tier === "2" ? tier : "all",
    source:
      source === "rss" ||
      source === "arxiv" ||
      source === "scholar" ||
      source === "websearch" ||
      source === "manual"
        ? source
        : "all",
  };
}

function hrefFor(current: Filters, patch: Partial<Filters>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.scope !== "all") params.set("scope", next.scope);
  if (next.days !== "7") params.set("days", next.days);
  if (next.tier !== "all") params.set("tier", next.tier);
  if (next.source !== "all") params.set("source", next.source);
  const q = params.toString();
  return q ? `/activity?${q}` : "/activity";
}

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

function loadItems(filters: Filters): ActivityItem[] {
  const repoRoot = process.cwd();
  const dates =
    filters.days === "all"
      ? listItemDates(repoRoot)
      : lastNDates(Number(filters.days));
  const items = readItemsForDates(repoRoot, dates);

  // Window by the item's own date, not just the scan-run date its file is
  // keyed on. Otherwise a recent scan that surfaces an old (e.g. 2025) article
  // shows up in the "30 days" view. Effective date = published_at, falling
  // back to discovered_at for undated items (so fresh-but-undated posts stay).
  const bounds =
    filters.days === "all" ? null : windowBounds(new Date(), Number(filters.days));

  return items
    .filter((i) => {
      if (bounds && !isFresh(i, bounds.startMs, bounds.endMs)) return false;
      if (filters.scope !== "all" && scopeOf(i) !== filters.scope) return false;
      if (filters.tier !== "all" && i.tier !== (Number(filters.tier) as ActivityTier)) return false;
      if (filters.source !== "all" && i.source_kind !== filters.source) return false;
      return true;
    })
    .sort((a, b) => {
      const at = a.published_at ? Date.parse(a.published_at) : Date.parse(a.discovered_at);
      const bt = b.published_at ? Date.parse(b.published_at) : Date.parse(b.discovered_at);
      return bt - at;
    });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const SCOPE_TABS: Array<{ id: ScopeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "member", label: "Members" },
  { id: "committee", label: "Committee" },
];

const DAYS_TABS: Array<{ id: DaysFilter; label: string }> = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "all", label: "All time" },
];

const TIER_TABS: Array<{ id: TierFilter; label: string }> = [
  { id: "all", label: "All tiers" },
  { id: "1", label: "Tier 1 (feeds)" },
  { id: "2", label: "Tier 2 (web)" },
];

const SOURCE_TABS: Array<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "All sources" },
  { id: "arxiv", label: "arXiv" },
  { id: "rss", label: "RSS" },
  { id: "websearch", label: "Web search" },
];

function FilterRow({
  label,
  tabs,
  current,
  filters,
  field,
}: {
  label: string;
  tabs: ReadonlyArray<{ id: string; label: string }>;
  current: string;
  filters: Filters;
  field: keyof Filters;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <span className="label shrink-0" style={{ minWidth: "5rem" }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = t.id === current;
          return (
            <Link
              key={t.id}
              href={hrefFor(filters, { [field]: t.id } as Partial<Filters>)}
              className="no-underline rounded px-2.5 py-1 text-xs"
              style={{
                backgroundColor: active ? "var(--color-accent-wash)" : "transparent",
                border: "1px solid var(--color-border-hair)",
                color: active ? "var(--color-ink)" : "var(--color-text-subtle)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toISOString().slice(0, 10);
}

function ActivityRow({
  item,
  memberName,
}: {
  item: ActivityItem;
  memberName: string;
}) {
  const scope = scopeOf(item);
  return (
    <article
      className="rail-accent py-3"
      style={{
        borderLeftColor:
          scope === "committee" ? "var(--color-accent)" : "var(--color-border-hair)",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="text-xs shrink-0"
            style={{
              color:
                scope === "committee"
                  ? "var(--color-accent)"
                  : "var(--color-text-subtle)",
              fontWeight: scope === "committee" ? 600 : 400,
            }}
          >
            {memberName}
          </span>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-base font-medium no-underline hover:text-[var(--color-accent)] truncate"
            style={{ color: "var(--color-ink)" }}
          >
            {item.title}
          </a>
        </div>
        <div
          className="flex items-center gap-3 text-xs shrink-0"
          style={{ color: "var(--color-text-subtle)" }}
        >
          <span>{formatDate(item.published_at)}</span>
          <span aria-hidden>·</span>
          <span>tier {item.tier}</span>
          <span aria-hidden>·</span>
          <span>{item.source_kind}</span>
        </div>
      </div>
      {item.snippet ? (
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text)" }}
        >
          {item.snippet}
        </p>
      ) : null}
      {item.match_reason ? (
        <p
          className="mt-1 text-xs italic"
          style={{ color: "var(--color-text-subtle)" }}
        >
          {item.match_reason}
        </p>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = readFilters(sp);
  const items = loadItems(filters);

  // Member name lookup. Committee items render as "Steering Committee".
  const members = listMembers();
  const memberNames = new Map<string, string>();
  for (const m of members) memberNames.set(m.member_id, m.name.full);
  memberNames.set(COMMITTEE_SCOPE_ID, "Steering Committee");

  // Header counts (across the loaded window, before scope filter so the
  // toggle shows "what's behind each tab").
  const repoRoot = process.cwd();
  const windowDates =
    filters.days === "all" ? listItemDates(repoRoot) : lastNDates(Number(filters.days));
  const countBounds =
    filters.days === "all" ? null : windowBounds(new Date(), Number(filters.days));
  const allInWindow = readItemsForDates(repoRoot, windowDates).filter((i) => {
    if (countBounds && !isFresh(i, countBounds.startMs, countBounds.endMs)) return false;
    if (filters.tier !== "all" && i.tier !== (Number(filters.tier) as ActivityTier)) return false;
    if (filters.source !== "all" && i.source_kind !== filters.source) return false;
    return true;
  });
  const memberCount = allInWindow.filter((i) => scopeOf(i) === "member").length;
  const committeeCount = allInWindow.filter((i) => scopeOf(i) === "committee").length;

  const digests = listDigestWeeks(repoRoot);
  const latestDigest = digests.length > 0 ? digests[digests.length - 1] : null;

  const lastScanDate = windowDates.length > 0 ? windowDates[windowDates.length - 1] : null;
  const today = isoDateUTC();

  return (
    <div className="pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="label">UCNFI · Activity scan</span>
          <h1 className="display mt-2">
            What the committee — and its members — are saying about AI
          </h1>
        </div>
        {latestDigest ? (
          <span className="label">
            Latest digest · {latestDigest}
          </span>
        ) : null}
      </header>

      <div
        className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-xs"
        style={{ color: "var(--color-text-subtle)" }}
      >
        <span>
          {memberCount} member item{memberCount === 1 ? "" : "s"}
          {" · "}
          {committeeCount} committee item{committeeCount === 1 ? "" : "s"}
          {" "}in window
        </span>
        {lastScanDate ? (
          <span>
            Last scan · {lastScanDate}
            {lastScanDate < today ? " (older than today)" : ""}
          </span>
        ) : (
          <span>No scan data yet</span>
        )}
      </div>

      <section className="mt-6 hairline pt-4 flex flex-col gap-3">
        <FilterRow
          label="Scope"
          tabs={SCOPE_TABS}
          current={filters.scope}
          filters={filters}
          field="scope"
        />
        <FilterRow
          label="Window"
          tabs={DAYS_TABS}
          current={filters.days}
          filters={filters}
          field="days"
        />
        <FilterRow
          label="Tier"
          tabs={TIER_TABS}
          current={filters.tier}
          filters={filters}
          field="tier"
        />
        <FilterRow
          label="Source"
          tabs={SOURCE_TABS}
          current={filters.source}
          filters={filters}
          field="source"
        />
      </section>

      <section className="mt-8 flex flex-col">
        {items.length === 0 ? (
          <p
            className="py-8 text-sm"
            style={{ color: "var(--color-text-subtle)" }}
          >
            No items match these filters. Try widening the window or changing
            the scope.
          </p>
        ) : (
          items.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              memberName={memberNames.get(item.member_id) ?? item.member_id}
            />
          ))
        )}
      </section>
    </div>
  );
}
