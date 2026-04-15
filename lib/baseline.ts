/**
 * Baseline loader + query layer for uc_ai_baseline.json (v0.6.0).
 *
 * Server-only. This module reads the JSON once on first import and
 * exposes typed accessors over it. All pages use this module — no
 * page imports the raw JSON directly.
 */

import baselineJson from "@/data/uc_ai_baseline.json";

export type EntityType = "campus" | "health_system" | "national_lab" | "systemwide";

export type FieldRecord = {
  value: boolean | string | number | null;
  source_id: string | null;
  source_url: string | null;
  notes: string | null;
};

/** The 10 declared dimensions plus document_count, which is a plain number. */
export const DIMENSION_IDS = [
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
] as const;

export type DimensionId = (typeof DIMENSION_IDS)[number];

export type DimensionMap = Partial<Record<DimensionId, Record<string, FieldRecord>>>;

export type Entity = {
  entity_id: string;
  entity_name: string;
  entity_type: EntityType;
  document_count?: number;
} & DimensionMap;

type RawBaseline = {
  metadata: {
    title: string;
    version: string;
    created: string;
    source: string;
    purpose: string;
    schema_version: string;
    notes: string;
  };
  schema: {
    entity_types: EntityType[];
    dimensions: Record<DimensionId, string>;
  };
  entities: Record<string, Entity>;
};

const raw = baselineJson as unknown as RawBaseline;

/* ------------------------------------------------------------------ */
/* Accessors                                                           */
/* ------------------------------------------------------------------ */

export const metadata = raw.metadata;
export const dimensionDescriptions = raw.schema.dimensions;

/** All entities, sorted by entity type then name. */
export function listEntities(): Entity[] {
  const typeOrder: Record<EntityType, number> = {
    systemwide: 0,
    campus: 1,
    health_system: 2,
    national_lab: 3,
  };
  return Object.values(raw.entities).sort((a, b) => {
    const t = typeOrder[a.entity_type] - typeOrder[b.entity_type];
    if (t !== 0) return t;
    return a.entity_name.localeCompare(b.entity_name);
  });
}

export function getEntity(id: string): Entity | undefined {
  return raw.entities[id];
}

export function entityIds(): string[] {
  return Object.keys(raw.entities);
}

export function dimensionsOf(entity: Entity): DimensionId[] {
  return DIMENSION_IDS.filter(
    (d) => entity[d] && Object.keys(entity[d]!).length > 0,
  );
}

export function fieldsOf(
  entity: Entity,
  dimension: DimensionId,
): Array<[string, FieldRecord]> {
  const bucket = entity[dimension];
  if (!bucket) return [];
  return Object.entries(bucket);
}

/* ------------------------------------------------------------------ */
/* Summary stats for the dashboard                                     */
/* ------------------------------------------------------------------ */

export type BaselineStats = {
  entityCount: number;
  dataPointCount: number;
  byType: Record<EntityType, number>;
  version: string;
};

export function baselineStats(): BaselineStats {
  const entities = listEntities();
  const byType: Record<EntityType, number> = {
    systemwide: 0,
    campus: 0,
    health_system: 0,
    national_lab: 0,
  };
  let dataPointCount = 0;
  for (const e of entities) {
    byType[e.entity_type] += 1;
    for (const d of DIMENSION_IDS) {
      const bucket = e[d];
      if (bucket) dataPointCount += Object.keys(bucket).length;
    }
  }
  return {
    entityCount: entities.length,
    dataPointCount,
    byType,
    version: raw.metadata.version,
  };
}

/* ------------------------------------------------------------------ */
/* Query — used by filters now, and by the Claude tool in Step 2      */
/* ------------------------------------------------------------------ */

export type QueryArgs = {
  entityIds?: string[];
  entityTypes?: EntityType[];
  dimensions?: DimensionId[];
  fieldNames?: string[];
  /** If set, only return fields whose `value` is strictly equal. */
  valueEquals?: boolean | string;
};

export type QueryHit = {
  entity_id: string;
  entity_name: string;
  entity_type: EntityType;
  dimension: DimensionId;
  field: string;
  record: FieldRecord;
};

export function queryBaseline(args: QueryArgs = {}): QueryHit[] {
  const hits: QueryHit[] = [];
  const wantedDims = args.dimensions ?? DIMENSION_IDS;
  for (const entity of listEntities()) {
    if (args.entityIds && !args.entityIds.includes(entity.entity_id)) continue;
    if (args.entityTypes && !args.entityTypes.includes(entity.entity_type)) continue;
    for (const dim of wantedDims) {
      const bucket = entity[dim];
      if (!bucket) continue;
      for (const [field, record] of Object.entries(bucket)) {
        if (args.fieldNames && !args.fieldNames.includes(field)) continue;
        if (args.valueEquals !== undefined && record.value !== args.valueEquals) continue;
        hits.push({
          entity_id: entity.entity_id,
          entity_name: entity.entity_name,
          entity_type: entity.entity_type,
          dimension: dim,
          field,
          record,
        });
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  systemwide: "Systemwide",
  campus: "Campus",
  health_system: "Health system",
  national_lab: "National lab",
};

export const DIMENSION_LABEL: Record<DimensionId, string> = {
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

export function humanizeField(fieldName: string): string {
  return fieldName
    .replace(/^has_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
