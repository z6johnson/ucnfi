import Link from "next/link";
import { notFound } from "next/navigation";
import { MemoBody } from "@/components/MemoBody";
import { getMemo, memoSlugs } from "@/lib/memos";
import { entityIds } from "@/lib/baseline";
import { pillars } from "@/content/northstar";

export function generateStaticParams() {
  return memoSlugs().map((slug) => ({ slug }));
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function MemoDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const memo = getMemo(slug);
  if (!memo) notFound();

  const known = new Set(entityIds());
  const pillar = memo.pillar
    ? pillars.find((p) => p.id === memo.pillar)
    : undefined;

  return (
    <div className="pt-12">
      <Link href="/memos" className="label">
        ← All memos
      </Link>

      <header className="mt-4 max-w-3xl">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="label">
            {memo.oa ? memo.oa.toUpperCase() : "UCNFI"}
            {pillar ? ` · ${pillar.name}` : ""}
          </span>
          <span
            className="label"
            style={{ color: "var(--color-text-subtle)" }}
          >
            {formatDate(memo.created)}
          </span>
          {memo.author ? (
            <span
              className="label"
              style={{ color: "var(--color-text-subtle)" }}
            >
              Drafted by {memo.author}
            </span>
          ) : null}
        </div>
        <h1 className="display mt-2">{memo.title}</h1>
        <p
          className="prose-body mt-4"
          style={{ color: "var(--color-text-muted)" }}
        >
          {memo.summary}
        </p>
      </header>

      <div className="mt-8 max-w-3xl">
        <MemoBody body={memo.body} knownEntityIds={known} />
      </div>

      <footer
        className="hairline mt-16 flex items-center justify-between py-6"
        style={{ color: "var(--color-text-subtle)" }}
      >
        <Link href="/chat" className="label">
          → Ask the copilot to revise this memo
        </Link>
        <Link href="/memos" className="label">
          ← All memos
        </Link>
      </footer>
    </div>
  );
}
