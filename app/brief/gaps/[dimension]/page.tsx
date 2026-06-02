import Link from "next/link";
import { notFound } from "next/navigation";
import { DIMENSION_IDS, type DimensionId } from "@/lib/baseline";
import { computeDimensionDetail } from "@/lib/brief/gaps";

export function generateStaticParams() {
  return DIMENSION_IDS.map((dimension) => ({ dimension }));
}

function isDimensionId(s: string): s is DimensionId {
  return (DIMENSION_IDS as readonly string[]).includes(s);
}

function stateLabel(state: "yes" | "no" | "equivocal" | "silent"): string {
  switch (state) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "equivocal":
      return "Equivocal";
    case "silent":
      return "Silent (inventory gap)";
  }
}

function stateTone(state: "yes" | "no" | "equivocal" | "silent"): string {
  switch (state) {
    case "yes":
      return "var(--color-accent)";
    case "no":
      return "var(--color-text-subtle)";
    case "equivocal":
      return "var(--color-warn-strong)";
    case "silent":
      return "var(--color-warn)";
  }
}

export default async function DimensionDetailPage({
  params,
}: {
  params: Promise<{ dimension: string }>;
}) {
  const { dimension } = await params;
  if (!isDimensionId(dimension)) notFound();
  const detail = computeDimensionDetail(dimension);

  return (
    <div className="pt-8">
      <Link href="/brief/gaps" className="label">
        ← All dimensions
      </Link>
      <header className="mt-4">
        <span className="label">UCOP · Position vs. the field</span>
        <h1 className="display mt-2">{detail.label}</h1>
      </header>

      <section className="mt-10">
        <header className="hairline flex items-baseline justify-between pb-2">
          <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
            UC field-level entries
          </h2>
          <span className="label">{detail.uc_entries.length}</span>
        </header>
        {detail.uc_entries.length === 0 ? (
          <p
            className="mt-4 text-sm"
            style={{ color: "var(--color-text-subtle)" }}
          >
            No UC entries in the baseline for this dimension.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-5">
            {detail.uc_entries.map((entry, idx) => (
              <li key={idx} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-4">
                  <Link
                    href={`/baseline/${entry.entity_id}`}
                    className="text-sm font-semibold no-underline"
                    style={{ color: "var(--color-ink)" }}
                  >
                    {entry.entity_name} · {entry.field}
                  </Link>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: stateTone(entry.state) }}
                  >
                    {stateLabel(entry.state)}
                  </span>
                </div>
                {entry.notes ? (
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {entry.notes}
                  </p>
                ) : null}
                {entry.source_url ? (
                  <a
                    href={entry.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs"
                  >
                    Source ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <header className="hairline flex items-baseline justify-between pb-2">
          <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
            Peers ahead of UC
          </h2>
          <span className="label">{detail.peers_ahead.length}</span>
        </header>
        {detail.peers_ahead.length === 0 ? (
          <p
            className="mt-4 text-sm"
            style={{ color: "var(--color-text-subtle)" }}
          >
            No peers in the current peer baseline have a position UC lacks on
            this dimension. (The peer baseline is hand-curated; sparse data
            here is honest, not a green light.)
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-5">
            {detail.peers_ahead.map((p, idx) => (
              <li key={idx} className="flex flex-col gap-1">
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {p.peer_name} · {p.field}
                </span>
                {p.notes ? (
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {p.notes}
                  </p>
                ) : null}
                {p.source_url ? (
                  <a
                    href={p.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs"
                  >
                    Source ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
