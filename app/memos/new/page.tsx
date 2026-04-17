import Link from "next/link";
import { NewMemoForm } from "@/components/NewMemoForm";
import { pillars } from "@/content/northstar";

export const dynamic = "force-dynamic";

export default function NewMemoPage() {
  return (
    <div className="pt-12">
      <header>
        <span className="label">UCNFI · Memos</span>
        <h1 className="display mt-2">New memo</h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Draft a share-ready memo. It is written as a markdown file under{" "}
          <code>content/memos/</code> and published immediately. Cite baseline
          entities with <code>[entity_id]</code> so they render as chips.
        </p>
        <div className="mt-4">
          <Link href="/memos" className="label">
            ← Back to memos
          </Link>
        </div>
      </header>

      <NewMemoForm pillars={pillars} />
    </div>
  );
}
