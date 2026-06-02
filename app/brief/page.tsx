import Link from "next/link";
import { EditionView } from "@/components/brief/EditionView";
import { readLatestEdition } from "@/lib/brief/storage";

export const metadata = {
  title: "Brief — UCOP",
  description:
    "Weekly, opinionated brief for the UC President — what's happening in AI between committee meetings, anchored to the UCOP baseline.",
};

export const dynamic = "force-dynamic";

export default function BriefIndexPage() {
  const edition = readLatestEdition(process.cwd());
  return (
    <div className="pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="label">UCOP · The Brief</span>
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

      {edition ? (
        <EditionView edition={edition} />
      ) : (
        <p
          className="mt-8 text-sm"
          style={{ color: "var(--color-text-subtle)" }}
        >
          No Brief has been published yet. Once an edition is reviewed and
          published it appears here.
        </p>
      )}
    </div>
  );
}
