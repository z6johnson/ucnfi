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
    <div className="pt-12">
      <header>
        <span className="label">UCNFI · Shared picture</span>
        <h1 className="display mt-2">
          What the UC system has built around AI
        </h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Every campus, health system, and lab is already doing AI work
          on its own. This is a way to see all of it together — what&rsquo;s
          in place across the system, where practices line up, and where the
          quiet gaps are. Pick a topic and the entities you want to look at,
          and read the same question answered for each one. It&rsquo;s a
          shared resource for the Steering Committee, not a leaderboard.
        </p>
        <div className="mt-4">
          <Link href="/about" className="label">
            → About the dimensions and method
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
