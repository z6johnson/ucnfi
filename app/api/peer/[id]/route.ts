import { NextResponse } from "next/server";
import { DIMENSION_IDS, DIMENSION_LABEL } from "@/lib/baseline";
import { getPeer, peerFieldsOf, PEER_KIND_LABEL } from "@/lib/peers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const peer = getPeer(id);
  if (!peer) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const dimensions = DIMENSION_IDS.map((dim) => {
    const fields = peerFieldsOf(peer, dim).map(([name, record]) => ({
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
    peer_id: peer.entity_id,
    peer_name: peer.entity_name,
    peer_kind: peer.peer_kind,
    peer_kind_label: PEER_KIND_LABEL[peer.peer_kind],
    uc_counterpart_id: peer.uc_counterpart_id ?? null,
    dimension_count: dimensions.length,
    field_count: totalFields,
    dimensions,
  });
}
