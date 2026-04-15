/**
 * Shared types for the /api/entity/[id] payload. Safe to import from
 * client components — contains no server-only modules.
 */

export type EntitySummaryField = {
  name: string;
  value: boolean | string | number | null;
  notes: string | null;
  source_id: string | null;
  source_url: string | null;
};

export type EntitySummaryDimension = {
  id: string;
  label: string;
  fields: EntitySummaryField[];
};

export type EntitySummary = {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  entity_type_label: string;
  document_count: number | null;
  dimension_count: number;
  field_count: number;
  dimensions: EntitySummaryDimension[];
};
