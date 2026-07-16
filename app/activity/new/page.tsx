import Link from "next/link";

import { NewActivityForm, type MemberOption } from "@/components/NewActivityForm";
import { listMembers } from "@/lib/committee";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add a source — UCOP Activity",
};

export default function NewActivityPage() {
  const members: MemberOption[] = listMembers().map((m) => ({
    id: m.member_id,
    name: m.name.full,
  }));

  return (
    <div className="pt-12">
      <header>
        <span className="label">UCOP · Activity</span>
        <h1 className="display mt-2">Add a source</h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Manually add an article, paper, or document to the activity feed for
          sharing and archival. Add a <strong>link</strong>, paste{" "}
          <strong>text</strong>, or upload a <strong>file</strong> (PDF, Word,
          etc.). The item is committed to the repo and appears in the feed after
          the site rebuilds (~60s).
        </p>
        <div className="mt-4">
          <Link href="/activity" className="label">
            ← Back to activity
          </Link>
        </div>
      </header>

      <NewActivityForm members={members} />
    </div>
  );
}
