import { NextResponse } from "next/server";
import {
  DIMENSION_IDS,
  DIMENSION_LABEL,
  ENTITY_TYPE_LABEL,
  fieldsOf,
  getEntity,
} from "@/lib/baseline";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const entity = getEntity(id);
  if (!entity) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const dimensions = DIMENSION_IDS.map((dim) => {
    const fields = fieldsOf(entity, dim).map(([name, record]) => ({
      name,
      value: record.value,
      notes: record.notes,
      source_id: record.source_id,
      source_url: record.source_url,
    }));
    return fields.length
      ? { id: dim, label: DIMENSION_LABEL[dim], fields }
      : null;
  }).filter((d): d is NonNullable<typeof d> => d !== null);

  const totalFields = dimensions.reduce((n, d) => n + d.fields.length, 0);

  return NextResponse.json({
    entity_id: entity.entity_id,
    entity_name: entity.entity_name,
    entity_type: entity.entity_type,
    entity_type_label: ENTITY_TYPE_LABEL[entity.entity_type],
    document_count: entity.document_count ?? null,
    dimension_count: dimensions.length,
    field_count: totalFields,
    dimensions,
  });
}
