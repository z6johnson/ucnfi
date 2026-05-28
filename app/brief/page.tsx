import Link from "next/link";
import { EditionList } from "@/components/brief/EditionList";
import { listEditions } from "@/lib/brief/storage";

export const metadata = {
  title: "Brief — UCNFI",
  description:
    "Weekly, opinionated brief for the UC President — what's happening in AI between committee meetings, anchored to the UCNFI baseline.",
};

export const dynamic = "force-dynamic";

export default function BriefIndexPage() {
  const editions = listEditions(process.cwd());
  return (
    <div className="pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="label">UCNFI · The Brief</span>
          <h1 className="display mt-2">
            What deserves the President's attention this week
          </h1>
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
