import { EntityCard } from "@/components/EntityCard";
import {
  ENTITY_TYPE_LABEL,
  listEntities,
  type EntityType,
} from "@/lib/baseline";

const TYPE_ORDER: EntityType[] = [
  "systemwide",
  "campus",
  "health_system",
  "national_lab",
];

export default function EntitiesPage() {
  const entities = listEntities();
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: entities.filter((e) => e.entity_type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="pt-12">
      <header>
        <span className="label">UCNFI · Baseline explorer</span>
        <h1 className="display mt-2">All entities</h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Every UC system, campus, health system, and national lab captured
          in the Phase 0 baseline. Each entity links to the full dimension
          breakdown — governance, policy, infrastructure, health AI,
          research, training, engagement, and more.
        </p>
      </header>

      {grouped.map((group) => (
        <section key={group.type} className="mt-12">
          <div className="hairline flex items-baseline justify-between pb-2">
            <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
              {ENTITY_TYPE_LABEL[group.type]}
            </h2>
            <span className="label">{group.items.length}</span>
          </div>
          <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {group.items.map((entity) => (
              <EntityCard key={entity.entity_id} entity={entity} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
