import { AuditTrail } from "@/components/brief/AuditTrail";
import { BriefItemCard, type BriefItemCardData } from "@/components/brief/BriefItemCard";
import { getEntity } from "@/lib/baseline";
import type { BriefEdition } from "@/lib/brief/types";
import { listMembers } from "@/lib/committee";

type Props = {
  edition: BriefEdition;
};

/**
 * Renders a single Brief edition: the week subheader, each item card, and the
 * audit trail. Baseline anchors are resolved at render time so chips display
 * the live FieldRecord rather than a stale snapshot from generation.
 *
 * Shared by the public Brief tab (app/brief/page.tsx), which shows the latest
 * published edition. Server component — it reads the baseline and committee
 * roster directly.
 */
export function EditionView({ edition }: Props) {
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
    <>
      <p
        className="mt-2 text-sm"
        style={{ color: "var(--color-text-subtle)" }}
      >
        Week {edition.edition_id}
        {edition.status === "draft" ? " · draft" : ""} · {edition.items.length} item
        {edition.items.length === 1 ? "" : "s"} · week ending {edition.week_ending}
      </p>

      {edition.items.length === 0 ? (
        <p
          className="mt-12 text-sm"
          style={{ color: "var(--color-text-subtle)" }}
        >
          This edition has zero items. An empty Brief is better than a padded one.
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
    </>
  );
}
