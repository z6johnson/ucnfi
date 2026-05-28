import Link from "next/link";
import type { BriefEdition } from "@/lib/brief/types";

type Props = {
  editions: BriefEdition[];
};

export function EditionList({ editions }: Props) {
  if (editions.length === 0) {
    return (
      <p
        className="mt-8 text-sm"
        style={{ color: "var(--color-text-subtle)" }}
      >
        No editions yet. Once an edition is generated it appears here.
      </p>
    );
  }

  // Most recent first.
  const sorted = [...editions].sort((a, b) =>
    b.edition_id.localeCompare(a.edition_id),
  );

  return (
    <ul className="mt-8 flex flex-col">
      {sorted.map((edition) => (
        <li key={edition.edition_id} className="hairline py-6">
          <Link
            href={`/brief/${edition.edition_id}`}
            className="no-underline"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2
                className="display"
                style={{
                  fontSize: "var(--text-lg)",
                  color: "var(--color-ink)",
                }}
              >
                Week {edition.edition_id}
                {edition.status === "draft" ? (
                  <span
                    className="label ml-3"
                    style={{ color: "var(--color-text-subtle)" }}
                  >
                    Draft
                  </span>
                ) : null}
              </h2>
              <span className="label">
                {edition.items.length} item{edition.items.length === 1 ? "" : "s"}
                {" · "}reviewed {edition.reviewed_by || "—"}
              </span>
            </div>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--color-text-muted)" }}
            >
              {edition.items.length > 0
                ? edition.items.map((i) => i.headline).slice(0, 2).join(" · ")
                : "(no items)"}
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--color-text-subtle)" }}
            >
              Week ending {edition.week_ending}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
