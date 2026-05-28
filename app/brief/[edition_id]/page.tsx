import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/components/brief/AuditTrail";
import { BriefItemCard, type BriefItemCardData } from "@/components/brief/BriefItemCard";
import { getEntity } from "@/lib/baseline";
import { listEditionIds, readEdition } from "@/lib/brief/storage";
import { listMembers } from "@/lib/committee";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return listEditionIds(process.cwd()).map((edition_id) => ({ edition_id }));
}

export default async function BriefEditionPage({
  params,
}: {
  params: Promise<{ edition_id: string }>;
}) {
  const { edition_id } = await params;
  const edition = readEdition(process.cwd(), edition_id);
  if (!edition) notFound();

  // Drafts are not visible on the public site. The 404 keeps draft
  // content from leaking via direct URL.
  if (edition.status !== "published") notFound();

  // Resolve baseline anchors at render time so chips display the live
  // FieldRecord rather than a stale snapshot from generation.
  const memberNames: Record<string, string> = {};
  for (const m of listMembers()) memberNames[m.member_id] = m.name.preferred ?? m.name.full;

  const cards: { editionId: string; data: BriefItemCardData }[] = edition.items.map(
    (item) => {
      const resolvedBaseline: BriefItemCardData["resolvedBaseline"] = {};
      for (const anchor of item.baseline_anchors) {
        const entity = getEntity(anchor.entity_id);
        const record = entity?.[anchor.dimension]?.[anchor.field];
        const key = `${anchor.entity_id}|${anchor.dimension}|${anchor.field}`;
        resolvedBaseline[key] = record
          ? {
              value: record.value,
              source_id: record.source_id,
              source_url: record.source_url,
              notes: record.notes,
            }
          : null;
      }
      return {
        editionId: edition.edition_id,
        data: { item, resolvedBaseline, memberNames },
      };
    },
  );

  return (
    <div className="pt-8">
      <Link href="/brief" className="label">
        ← All editions
      </Link>

      <header className="mt-4">
        <span className="label">UCNFI · The Brief</span>
        <h1 className="display mt-2">Week {edition.edition_id}</h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-text-subtle)" }}
        >
          {edition.items.length} item{edition.items.length === 1 ? "" : "s"} · week ending {edition.week_ending}
        </p>
      </header>

      {edition.items.length === 0 ? (
        <p
          className="mt-12 text-sm"
          style={{ color: "var(--color-text-subtle)" }}
        >
          This edition was published with zero items. An empty Brief is better
          than a padded one.
        </p>
      ) : null}

      {cards.map(({ editionId, data }) => (
        <BriefItemCard
          key={data.item.item_id}
          editionId={editionId}
          data={data}
        />
      ))}

      <AuditTrail edition={edition} />
    </div>
  );
}
