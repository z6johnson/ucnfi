import Link from "next/link";
import {
  DIMENSION_IDS,
  ENTITY_TYPE_LABEL,
  type Entity,
} from "@/lib/baseline";

export function EntityCard({ entity }: { entity: Entity }) {
  const filled = DIMENSION_IDS.filter(
    (d) => entity[d] && Object.keys(entity[d]!).length > 0,
  );
  const dataPoints = filled.reduce(
    (n, d) => n + Object.keys(entity[d]!).length,
    0,
  );

  return (
    <Link
      href={`/entities/${entity.entity_id}`}
      className="group block rail-accent no-underline"
      style={{ borderLeftColor: "var(--color-border-hair)" }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span
          className="text-base font-semibold group-hover:text-[var(--color-accent)]"
          style={{ color: "var(--color-ink)" }}
        >
          {entity.entity_name}
        </span>
        <span className="label shrink-0">
          {ENTITY_TYPE_LABEL[entity.entity_type]}
        </span>
      </div>
      <div
        className="mt-1 flex items-center gap-3 text-xs"
        style={{ color: "var(--color-text-subtle)" }}
      >
        <span>{filled.length} dimensions</span>
        <span aria-hidden>·</span>
        <span>{dataPoints} data points</span>
      </div>
    </Link>
  );
}
