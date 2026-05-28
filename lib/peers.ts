/**
 * Peer-institution baseline loader.
 *
 * Mirrors lib/baseline.ts exactly so renderers can reuse DimensionSection
 * and other components without branching. Peers live in a SEPARATE file
 * (data/peer_ai_baseline.json) so a peer can never accidentally roll up
 * into a UC-only count.
 *
 * No "server-only" import: the generation pipeline reads peers under
 * --experimental-strip-types.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DIMENSION_IDS,
  type DimensionId,
  type FieldRecord,
  type QueryArgs,
} from "./baseline.ts";

export type PeerKind = "public_aau" | "private_aau" | "system" | "other";

export type PeerDimensionMap = Partial<
  Record<DimensionId, Record<string, FieldRecord>>
>;

export type Peer = {
  entity_id: string;
  entity_name: string;
  peer_kind: PeerKind;
  uc_counterpart_id?: string;
} & PeerDimensionMap;

type RawPeerBaseline = {
  metadata: Record<string, string>;
  schema: {
    peer_kinds: PeerKind[];
    dimensions: Record<DimensionId, string>;
  };
  entities: Record<string, Peer>;
};

const raw = JSON.parse(
  readFileSync(join(process.cwd(), "data", "peer_ai_baseline.json"), "utf-8"),
) as RawPeerBaseline;

/* ------------------------------------------------------------------ */
/* Accessors                                                           */
/* ------------------------------------------------------------------ */

export function listPeers(): Peer[] {
  return Object.values(raw.entities).sort((a, b) =>
    a.entity_name.localeCompare(b.entity_name),
  );
}

export function getPeer(id: string): Peer | undefined {
  return raw.entities[id];
}

export function peerIds(): string[] {
  return Object.keys(raw.entities);
}

export function peerDimensionsOf(peer: Peer): DimensionId[] {
  return DIMENSION_IDS.filter(
    (d) => peer[d] && Object.keys(peer[d]!).length > 0,
  );
}

export function peerFieldsOf(
  peer: Peer,
  dimension: DimensionId,
): Array<[string, FieldRecord]> {
  const bucket = peer[dimension];
  if (!bucket) return [];
  return Object.entries(bucket);
}

/* ------------------------------------------------------------------ */
/* Query                                                               */
/* ------------------------------------------------------------------ */

export type PeerQueryHit = {
  peer_id: string;
  peer_name: string;
  peer_kind: PeerKind;
  dimension: DimensionId;
  field: string;
  record: FieldRecord;
};

/** Mirror of queryBaseline, scoped to peers. */
export function queryPeerBaseline(
  args: Pick<QueryArgs, "dimensions" | "fieldNames" | "valueEquals"> = {},
): PeerQueryHit[] {
  const hits: PeerQueryHit[] = [];
  const wantedDims = args.dimensions ?? DIMENSION_IDS;
  for (const peer of listPeers()) {
    for (const dim of wantedDims) {
      const bucket = peer[dim];
      if (!bucket) continue;
      for (const [field, record] of Object.entries(bucket)) {
        if (args.fieldNames && !args.fieldNames.includes(field)) continue;
        if (args.valueEquals !== undefined && record.value !== args.valueEquals) continue;
        hits.push({
          peer_id: peer.entity_id,
          peer_name: peer.entity_name,
          peer_kind: peer.peer_kind,
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
/* Prompt block                                                        */
/* ------------------------------------------------------------------ */

let cachedPeerBlock: string | null = null;

/**
 * Compact text representation of the peer baseline for inclusion in
 * the brief generator's cached system prompt. Mirrors the JSON shape
 * verbatim so the model has the same field-level addressability as it
 * does for the UC baseline.
 */
export function peerBaselineBlock(): string {
  if (cachedPeerBlock) return cachedPeerBlock;
  const rawText = readFileSync(
    join(process.cwd(), "data", "peer_ai_baseline.json"),
    "utf-8",
  );
  cachedPeerBlock = `## PEER BASELINE (non-UC institutions, v${raw.metadata.version ?? "0.1.0"})

The JSON document below is the authoritative source for every factual claim about a peer institution. Use peer_anchors with this peer_id / dimension / field shape when citing a peer move.

\`\`\`json
${rawText}
\`\`\``;
  return cachedPeerBlock;
}

export const PEER_KIND_LABEL: Record<PeerKind, string> = {
  public_aau: "Public AAU",
  private_aau: "Private AAU",
  system: "System",
  other: "Other",
};
