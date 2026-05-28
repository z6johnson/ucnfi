/**
 * Companion view: "UC's position vs. the field."
 *
 * Pure data: walks queryBaseline + queryPeerBaseline once and produces
 * a per-dimension snapshot suitable for /brief/gaps. No LLM call. The
 * computation is cheap and idempotent, so the page can read it
 * directly on each request without caching.
 */

import {
  DIMENSION_IDS,
  DIMENSION_LABEL,
  type DimensionId,
  type FieldRecord,
  queryBaseline,
} from "../baseline.ts";
import { listPeers, peerFieldsOf, type Peer } from "../peers.ts";

export type DimensionGapRow = {
  dimension: DimensionId;
  label: string;
  uc_has_position: number;
  uc_silent: number;
  uc_contradicts: number;
  peers_ahead: number;
  peer_example: { peer_id: string; peer_name: string; field: string } | null;
};

export type GapMatrix = {
  rows: DimensionGapRow[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isTruthy(record: FieldRecord): boolean {
  if (record.value === true) return true;
  if (typeof record.value === "string" && record.value !== "equivocal" && record.value.length > 0) {
    return true;
  }
  return false;
}

function isInventoryGap(record: FieldRecord): boolean {
  return record.value === false && record.source_id === "inventory-gap";
}

function isEquivocal(record: FieldRecord): boolean {
  return record.value === "equivocal";
}

function ucPositionsByField(dim: DimensionId): Map<string, "yes" | "no" | "equivocal" | "silent"> {
  const map = new Map<string, "yes" | "no" | "equivocal" | "silent">();
  for (const hit of queryBaseline({ dimensions: [dim] })) {
    const cur = map.get(hit.field);
    const next = isTruthy(hit.record)
      ? "yes"
      : isEquivocal(hit.record)
        ? "equivocal"
        : isInventoryGap(hit.record)
          ? "silent"
          : "no";
    // "yes" wins (at least one UC entity has it); else "equivocal";
    // else "silent"; else "no" (rare).
    if (cur === "yes") continue;
    if (next === "yes" || cur === undefined) map.set(hit.field, next);
    else if (cur !== "equivocal" && next === "equivocal") map.set(hit.field, next);
  }
  return map;
}

function findPeersAhead(
  dim: DimensionId,
  ucByField: Map<string, "yes" | "no" | "equivocal" | "silent">,
): Array<{ peer: Peer; field: string }> {
  const ahead: Array<{ peer: Peer; field: string }> = [];
  for (const peer of listPeers()) {
    for (const [field, record] of peerFieldsOf(peer, dim)) {
      if (!isTruthy(record)) continue;
      // "peers_ahead" means: peer has a truthy position on a field UC
      // has either never recorded (no entry in ucByField) or where
      // every UC entity says "silent" / "no" / "equivocal" — i.e., no
      // single UC entity has it.
      const uc = ucByField.get(field);
      if (uc !== "yes") ahead.push({ peer, field });
    }
  }
  return ahead;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function computeGapMatrix(): GapMatrix {
  const rows: DimensionGapRow[] = [];
  for (const dim of DIMENSION_IDS) {
    let ucHas = 0;
    let ucSilent = 0;
    let ucContradicts = 0;
    // Per-entity-per-dimension: an entity counts toward ucHas if it
    // has any truthy field in the dimension; toward ucSilent if it has
    // any inventory-gap field; toward ucContradicts if it has any
    // equivocal field. (An entity can land in multiple buckets — we
    // tally fields-into-buckets, not entities, on the latter two.)
    const entitySeen = new Set<string>();
    for (const hit of queryBaseline({ dimensions: [dim] })) {
      if (isTruthy(hit.record)) {
        if (!entitySeen.has(hit.entity_id + "::has")) {
          entitySeen.add(hit.entity_id + "::has");
          ucHas += 1;
        }
      } else if (isInventoryGap(hit.record)) {
        ucSilent += 1;
      } else if (isEquivocal(hit.record)) {
        ucContradicts += 1;
      }
    }

    const ucByField = ucPositionsByField(dim);
    const ahead = findPeersAhead(dim, ucByField);
    const peerExample = ahead.length > 0
      ? {
          peer_id: ahead[0].peer.entity_id,
          peer_name: ahead[0].peer.entity_name,
          field: ahead[0].field,
        }
      : null;

    rows.push({
      dimension: dim,
      label: DIMENSION_LABEL[dim],
      uc_has_position: ucHas,
      uc_silent: ucSilent,
      uc_contradicts: ucContradicts,
      peers_ahead: ahead.length,
      peer_example: peerExample,
    });
  }
  return { rows };
}

export type DimensionGapDetail = {
  dimension: DimensionId;
  label: string;
  uc_entries: Array<{
    entity_id: string;
    entity_name: string;
    field: string;
    state: "yes" | "no" | "equivocal" | "silent";
    notes: string | null;
    source_url: string | null;
  }>;
  peers_ahead: Array<{
    peer_id: string;
    peer_name: string;
    field: string;
    notes: string | null;
    source_url: string | null;
  }>;
};

export function computeDimensionDetail(dim: DimensionId): DimensionGapDetail {
  const ucEntries: DimensionGapDetail["uc_entries"] = [];
  for (const hit of queryBaseline({ dimensions: [dim] })) {
    const state: DimensionGapDetail["uc_entries"][number]["state"] = isTruthy(hit.record)
      ? "yes"
      : isEquivocal(hit.record)
        ? "equivocal"
        : isInventoryGap(hit.record)
          ? "silent"
          : "no";
    ucEntries.push({
      entity_id: hit.entity_id,
      entity_name: hit.entity_name,
      field: hit.field,
      state,
      notes: hit.record.notes,
      source_url: hit.record.source_url,
    });
  }

  const ucByField = ucPositionsByField(dim);
  const ahead = findPeersAhead(dim, ucByField);
  const peersAhead = ahead.map(({ peer, field }) => {
    const record = peer[dim]?.[field];
    return {
      peer_id: peer.entity_id,
      peer_name: peer.entity_name,
      field,
      notes: record?.notes ?? null,
      source_url: record?.source_url ?? null,
    };
  });

  return {
    dimension: dim,
    label: DIMENSION_LABEL[dim],
    uc_entries: ucEntries,
    peers_ahead: peersAhead,
  };
}
