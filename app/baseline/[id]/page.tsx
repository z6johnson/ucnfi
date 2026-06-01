import Link from "next/link";
import { notFound } from "next/navigation";
import { DimensionSection, type FieldUpdateMeta } from "@/components/DimensionSection";
import {
  DIMENSION_IDS,
  ENTITY_TYPE_LABEL,
  entityIds,
  fieldsOf,
  getEntity,
} from "@/lib/baseline";
import { fieldLastUpdatedIndex } from "@/lib/enrich/history";

export function generateStaticParams() {
  return entityIds().map((id) => ({ id }));
}

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entity = getEntity(id);
  if (!entity) notFound();

  const populated = DIMENSION_IDS.filter((d) => fieldsOf(entity, d).length > 0);
  const totalFields = populated.reduce(
    (n, d) => n + fieldsOf(entity, d).length,
    0,
  );

  // Per-field "last updated" derived from applied changeset history.
  const updateIndex = fieldLastUpdatedIndex(process.cwd());
  const updatesFor = (dim: string): Record<string, FieldUpdateMeta> => {
    const out: Record<string, FieldUpdateMeta> = {};
    for (const [field] of fieldsOf(entity, dim as (typeof DIMENSION_IDS)[number])) {
      const hit = updateIndex.get(`${entity.entity_id}.${dim}.${field}`);
      if (hit) out[field] = { version: hit.version, date: hit.applied_at.slice(0, 10) };
    }
    return out;
  };

  return (
    <div className="pt-12">
      <Link href="/baseline" className="label">
        ← All entities
      </Link>

      <header className="mt-4">
        <span className="label">{ENTITY_TYPE_LABEL[entity.entity_type]}</span>
        <h1 className="display mt-2">{entity.entity_name}</h1>
        <div
          className="mt-2 flex items-center gap-4 text-sm"
          style={{ color: "var(--color-text-subtle)" }}
        >
          <span>{populated.length} dimensions populated</span>
          <span aria-hidden>·</span>
          <span>{totalFields} data points</span>
          {entity.document_count !== undefined ? (
            <>
              <span aria-hidden>·</span>
              <span>{entity.document_count} source documents</span>
            </>
          ) : null}
        </div>
      </header>

      {populated.map((dim) => (
        <DimensionSection
          key={dim}
          dimension={dim}
          fields={fieldsOf(entity, dim)}
          updates={updatesFor(dim)}
        />
      ))}
    </div>
  );
}
