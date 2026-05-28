/**
 * Shared types for the /api/peer/[id] payload. Safe to import from
 * client components — contains no server-only modules.
 */

export type PeerSummaryField = {
  name: string;
  value: boolean | string | number | null;
  notes: string | null;
  source_id: string | null;
  source_url: string | null;
};

export type PeerSummaryDimension = {
  id: string;
  label: string;
  fields: PeerSummaryField[];
};

export type PeerSummary = {
  peer_id: string;
  peer_name: string;
  peer_kind: string;
  peer_kind_label: string;
  uc_counterpart_id: string | null;
  dimension_count: number;
  field_count: number;
  dimensions: PeerSummaryDimension[];
};
