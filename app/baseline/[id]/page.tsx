import Link from "next/link";
import { notFound } from "next/navigation";
import { DimensionSection } from "@/components/DimensionSection";
import {
  DIMENSION_IDS,
  ENTITY_TYPE_LABEL,
  entityIds,
  fieldsOf,
  getEntity,
} from "@/lib/baseline";

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
        />
      ))}
    </div>
  );
}
