import Link from "next/link";
import { CompareMatrix } from "@/components/CompareMatrix";
import { listEntities } from "@/lib/baseline";

export default function ComparePage() {
  const entities = listEntities();

  // Default picks: the first four campuses alphabetically. Gives a
  // non-trivial but readable matrix on first load.
  const defaultEntityIds = entities
    .filter((e) => e.entity_type === "campus")
    .slice(0, 4)
    .map((e) => e.entity_id);

  return (
    <div className="pt-12">
      <header>
        <span className="label">UCNFI · Compare</span>
        <h1 className="display mt-2">Cross-entity comparison</h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Pick any slice of the baseline — a dimension plus any number of
          entities — and read the same question answered side-by-side for
          each one. Every cell shows the field value, the committee-relevant
          note, and the source id it was pulled from. Click a cell&rsquo;s
          source link to open the original document, or a column header to
          open that entity&rsquo;s full profile.
        </p>
        <div className="mt-4">
          <Link href="/about" className="label">
            → About the dimensions + method
          </Link>
        </div>
      </header>

      <div className="mt-12">
        <CompareMatrix
          entities={entities}
          defaultEntityIds={defaultEntityIds}
          defaultDimension="governance"
        />
      </div>
    </div>
  );
}
