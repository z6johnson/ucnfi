import Link from "next/link";
import { CompareMatrix } from "@/components/CompareMatrix";
import { listEntities } from "@/lib/baseline";

export default function HomePage() {
  const entities = listEntities();

  // Default picks: the first four campuses alphabetically. Gives a
  // non-trivial but readable matrix on first load.
  const defaultEntityIds = entities
    .filter((e) => e.entity_type === "campus")
    .slice(0, 4)
    .map((e) => e.entity_id);

  return (
    <div className="pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="label">UCOP · Shared picture</span>
          <h1 className="display mt-2">
            What the UC system has built around AI
          </h1>
        </div>
        <Link href="/about" className="label">
          → Dimensions and method
        </Link>
      </header>

      <div className="mt-8">
        <CompareMatrix
          entities={entities}
          defaultEntityIds={defaultEntityIds}
          defaultDimension="governance"
        />
      </div>
    </div>
  );
}
