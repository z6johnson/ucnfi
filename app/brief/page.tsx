import Link from "next/link";
import { EditionList } from "@/components/brief/EditionList";
import { listPublishedEditions } from "@/lib/brief/storage";

export const metadata = {
  title: "Brief — UCNFI",
  description:
    "Weekly, opinionated brief for the UC President — what's happening in AI between committee meetings, anchored to the UCNFI baseline.",
};

export const dynamic = "force-dynamic";

export default function BriefIndexPage() {
  const editions = listPublishedEditions(process.cwd());
  return (
    <div className="pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="label">UCNFI · The Brief</span>
          <h1 className="display mt-2">
            What deserves the President's attention this week
          </h1>
          <p
            className="prose-body mt-4 max-w-2xl"
            style={{ color: "var(--color-text-muted)" }}
          >
            Three to five items, every week. Each item answers: what happened,
            why it matters to UC, and what the committee should do about it.
            Every &quot;why it matters&quot; claim cites a specific baseline field, so
            the synthesis is challengeable. AI-assembled, human-reviewed —
            drafts don&apos;t reach the President.
          </p>
        </div>
        <Link
          href="/brief/gaps"
          className="label"
        >
          → UC&apos;s position vs. the field
        </Link>
      </header>

      <EditionList editions={editions} />
    </div>
  );
}
