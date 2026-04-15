"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  DimensionId,
  Entity,
  EntityType,
  FieldRecord,
} from "@/lib/baseline";

/* ------------------------------------------------------------------ */
/* Display constants — duplicated here to avoid importing the         */
/* server-only `lib/baseline` module into a client bundle.             */
/* ------------------------------------------------------------------ */

const DIMENSION_IDS: DimensionId[] = [
  "governance",
  "policy",
  "academic_integrity",
  "infrastructure",
  "leadership",
  "health_ai",
  "research",
  "training",
  "engagement",
  "security",
];

const DIMENSION_LABEL: Record<DimensionId, string> = {
  governance: "Governance",
  policy: "Policy",
  academic_integrity: "Academic integrity",
  infrastructure: "Infrastructure",
  leadership: "Leadership",
  health_ai: "Health AI",
  research: "Research",
  training: "Training",
  engagement: "Engagement",
  security: "Security",
};

const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  systemwide: "Systemwide",
  campus: "Campus",
  health_system: "Health system",
  national_lab: "National lab",
};

const TYPE_ORDER: EntityType[] = [
  "systemwide",
  "campus",
  "health_system",
  "national_lab",
];

function humanizeField(name: string) {
  return name
    .replace(/^has_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type Props = {
  entities: Entity[];
  defaultEntityIds: string[];
  defaultDimension: DimensionId;
};

export function CompareMatrix({
  entities,
  defaultEntityIds,
  defaultDimension,
}: Props) {
  const [selectedIds, setSelectedIds] =
    useState<string[]>(defaultEntityIds);
  const [dim, setDim] = useState<DimensionId>(defaultDimension);

  // Keep the on-screen column order matching the entities list (not
  // the order the user clicked them in) so the matrix reads the same
  // each time.
  const selected = useMemo(
    () => entities.filter((e) => selectedIds.includes(e.entity_id)),
    [entities, selectedIds],
  );

  // Union of field names across the selected entities for the chosen
  // dimension. Absent field = em-dash in the matching cell.
  const fieldNames = useMemo(() => {
    const set = new Set<string>();
    for (const e of selected) {
      const bucket = e[dim];
      if (!bucket) continue;
      for (const k of Object.keys(bucket)) set.add(k);
    }
    return Array.from(set).sort();
  }, [selected, dim]);

  // Per-dimension coverage count for the picker badges (how many
  // selected entities have *any* data for each dimension).
  const dimCoverage = useMemo(() => {
    const counts: Partial<Record<DimensionId, number>> = {};
    for (const d of DIMENSION_IDS) {
      let n = 0;
      for (const e of selected) {
        const bucket = e[d];
        if (bucket && Object.keys(bucket).length > 0) n += 1;
      }
      counts[d] = n;
    }
    return counts;
  }, [selected]);

  const groups = useMemo(
    () =>
      TYPE_ORDER.map((t) => ({
        type: t,
        items: entities.filter((e) => e.entity_type === t),
      })).filter((g) => g.items.length > 0),
    [entities],
  );

  const toggleEntity = (id: string) =>
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );

  const selectByType = (t: EntityType) =>
    setSelectedIds(
      entities.filter((e) => e.entity_type === t).map((e) => e.entity_id),
    );

  const clearAll = () => setSelectedIds([]);
  const selectAll = () =>
    setSelectedIds(entities.map((e) => e.entity_id));

  return (
    <div>
      {/* ---------- Dimension picker ---------- */}
      <section>
        <div className="hairline flex items-baseline justify-between pb-2">
          <span className="label">Dimension</span>
          <span className="label">{DIMENSION_IDS.length} total</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {DIMENSION_IDS.map((d) => {
            const active = d === dim;
            const coverage = dimCoverage[d] ?? 0;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDim(d)}
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
                }}
                title={`${coverage} of ${selected.length} selected entities have data here`}
              >
                {DIMENSION_LABEL[d]}
                <span
                  style={{
                    marginLeft: "0.5rem",
                    opacity: 0.7,
                    fontWeight: 500,
                  }}
                >
                  {coverage}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Entity picker ---------- */}
      <section className="mt-10">
        <div className="hairline flex items-baseline justify-between pb-2">
          <span className="label">
            Entities · {selected.length} selected
          </span>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={selectAll}
              className="label"
              style={{ color: "var(--color-accent)", cursor: "pointer" }}
            >
              All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="label"
              style={{ color: "var(--color-accent)", cursor: "pointer" }}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-6 md:grid-cols-4">
          {groups.map((g) => (
            <div key={g.type}>
              <div className="flex items-baseline justify-between">
                <span className="label">{ENTITY_TYPE_LABEL[g.type]}</span>
                <button
                  type="button"
                  onClick={() => selectByType(g.type)}
                  className="label"
                  style={{
                    color: "var(--color-accent)",
                    cursor: "pointer",
                  }}
                >
                  Only these
                </button>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {g.items.map((e) => {
                  const active = selectedIds.includes(e.entity_id);
                  return (
                    <li key={e.entity_id}>
                      <label
                        className="flex cursor-pointer items-center gap-2 text-sm"
                        style={{
                          color: active
                            ? "var(--color-ink)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleEntity(e.entity_id)}
                          style={{ accentColor: "var(--color-accent)" }}
                        />
                        {e.entity_name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Matrix ---------- */}
      <section className="mt-12">
        <div className="hairline flex items-baseline justify-between pb-2">
          <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
            {DIMENSION_LABEL[dim]}
          </h2>
          <span className="label">
            {fieldNames.length} fields · {selected.length} entities
          </span>
        </div>

        {selected.length === 0 ? (
          <EmptyState label="Pick one or more entities above to build the matrix." />
        ) : fieldNames.length === 0 ? (
          <EmptyState
            label={`None of the selected entities have data for ${DIMENSION_LABEL[dim]}. Try a different dimension — coverage counts are shown on each chip.`}
          />
        ) : (
          <div
            className="mt-4 overflow-x-auto"
            style={{ borderTop: "1px solid var(--color-border-hair)" }}
          >
            <table
              className="w-full border-collapse"
              style={{
                minWidth: `${Math.max(640, selected.length * 200 + 260)}px`,
              }}
            >
              <thead>
                <tr>
                  <th
                    className="label pb-3 pr-5 pt-4 text-left align-bottom"
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "var(--color-bg)",
                      minWidth: "240px",
                      zIndex: 1,
                    }}
                  >
                    Field
                  </th>
                  {selected.map((e) => (
                    <th
                      key={e.entity_id}
                      className="pb-3 pr-5 pt-4 text-left align-bottom"
                      style={{ minWidth: "200px" }}
                    >
                      <Link
                        href={`/baseline/${e.entity_id}`}
                        className="label"
                        style={{ color: "var(--color-text-subtle)" }}
                      >
                        {e.entity_name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fieldNames.map((fname) => (
                  <tr
                    key={fname}
                    style={{
                      borderTop: "1px solid var(--color-border-hair)",
                    }}
                  >
                    <td
                      className="py-4 pr-5 align-top"
                      style={{
                        position: "sticky",
                        left: 0,
                        background: "var(--color-bg)",
                      }}
                    >
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "var(--color-text)" }}
                      >
                        {humanizeField(fname)}
                      </span>
                    </td>
                    {selected.map((e) => (
                      <td
                        key={e.entity_id}
                        className="py-4 pr-5 align-top"
                      >
                        <Cell record={e[dim]?.[fname]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell                                                                */
/* ------------------------------------------------------------------ */

function Cell({ record }: { record: FieldRecord | undefined }) {
  if (!record) {
    return (
      <span
        className="text-sm"
        style={{ color: "var(--color-text-subtle)" }}
      >
        —
      </span>
    );
  }

  const { value } = record;
  let rendered: React.ReactNode;
  if (value === true) {
    rendered = (
      <span
        className="text-sm font-semibold"
        style={{ color: "var(--color-accent)" }}
      >
        Yes
      </span>
    );
  } else if (value === false) {
    rendered = (
      <span
        className="text-sm font-semibold"
        style={{ color: "var(--color-text-subtle)" }}
      >
        No
      </span>
    );
  } else if (value === null || value === undefined) {
    rendered = (
      <span
        className="text-sm"
        style={{ color: "var(--color-text-subtle)" }}
      >
        —
      </span>
    );
  } else {
    rendered = (
      <span
        className="text-sm font-semibold"
        style={{ color: "var(--color-ink)" }}
      >
        {String(value)}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {rendered}
      {record.notes ? (
        <span
          className="text-xs"
          style={{ color: "var(--color-text-muted)" }}
          title={record.notes}
        >
          {record.notes.length > 140
            ? record.notes.slice(0, 137) + "…"
            : record.notes}
        </span>
      ) : null}
      {record.source_id || record.source_url ? (
        <div className="flex items-center gap-2 pt-1">
          {record.source_id ? (
            <span className="label">{record.source_id}</span>
          ) : null}
          {record.source_url ? (
            <a
              href={record.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs"
              title="Open source"
            >
              ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
