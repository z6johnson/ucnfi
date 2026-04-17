import Link from "next/link";
import { listMemos } from "@/lib/memos";
import { pillars } from "@/content/northstar";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MemosPage() {
  const memos = listMemos();

  return (
    <div className="pt-12">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="label">UCNFI · Memos</span>
            <h1 className="display mt-2">Committee memos</h1>
          </div>
          <Link
            href="/memos/new"
            className="label"
            style={{ color: "var(--color-accent)" }}
          >
            + New memo
          </Link>
        </div>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          Short, share-ready artifacts drafted from the baseline. Each memo
          answers a single committee-level question and cites every factual
          claim back to specific entities in the UCNFI baseline.
        </p>
      </header>

      {memos.length === 0 ? (
        <div
          className="rail-accent mt-10 max-w-xl"
          style={{ borderLeftColor: "var(--color-border-hair)" }}
        >
          <span className="label">No memos yet</span>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            Use <Link href="/memos/new" className="label" style={{ color: "var(--color-accent)" }}>+ New memo</Link>{" "}
            above, or drop markdown files into <code>content/memos/</code>.
          </p>
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-8">
          {memos.map((memo) => {
            const pillar = memo.pillar
              ? pillars.find((p) => p.id === memo.pillar)
              : undefined;
            return (
              <li key={memo.slug}>
                <article
                  className="rail-accent"
                  style={{
                    borderLeftColor: pillar
                      ? `var(${pillar.cssVar})`
                      : "var(--color-border-hair)",
                  }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
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
                  </div>
                  <h2
                    className="mt-2 text-lg font-bold"
                    style={{ color: "var(--color-ink)" }}
                  >
                    <Link href={`/memos/${memo.slug}`}>{memo.title}</Link>
                  </h2>
                  <p
                    className="prose-body mt-2 max-w-2xl"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {memo.summary}
                  </p>
                  <div className="mt-3">
                    <Link href={`/memos/${memo.slug}`} className="label">
                      Read memo →
                    </Link>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
