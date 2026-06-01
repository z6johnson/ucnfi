import { baselineStats, metadata as baselineMeta } from "@/lib/baseline";
import { AppliedList, PendingList } from "@/components/enrich/ChangesetList";
import { appliedChangesets, pendingChangesets } from "@/lib/enrich/history";

export const metadata = {
  title: "Data status — UCNFI",
  description:
    "When and where the UC AI governance baseline was last updated — applied refreshes and proposals still awaiting review.",
};

export const dynamic = "force-dynamic";

function ageInDays(isoDate: string): number {
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export default function DataStatusPage() {
  const repoRoot = process.cwd();
  const stats = baselineStats();
  const pending = pendingChangesets(repoRoot);
  const applied = appliedChangesets(repoRoot);
  const age = ageInDays(baselineMeta.created);
  const stale = age > 45;

  return (
    <div className="pt-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <span className="label">UCNFI · Data status</span>
          <h1 className="display mt-2">When and where the data was last updated</h1>
        </div>
      </header>

      <div
        className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm"
        style={{ color: "var(--color-text-subtle)" }}
      >
        <span>
          Live baseline <strong>v{stats.version}</strong> · {stats.entityCount}{" "}
          entities · {stats.dataPointCount} data points
        </span>
        <span>
          as of {baselineMeta.created}
          {stale ? (
            <span style={{ color: "var(--color-warn-strong)" }}>
              {" "}
              · {age} days old
            </span>
          ) : null}
        </span>
      </div>

      <p className="mt-4 max-w-2xl text-sm" style={{ color: "var(--color-text-muted)" }}>
        The shared picture is refreshed by a monthly enrichment run that{" "}
        <em>proposes</em> changes. Nothing reaches this baseline until a human
        reviews the proposal and applies it — so a refresh that is still pending
        review will not change the numbers above. Both states are shown below.
      </p>

      <section className="mt-10">
        <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
          Pending review
          {pending.length > 0 ? (
            <span
              className="label ml-3"
              style={{ color: "var(--color-warn-strong)" }}
            >
              {pending.length} awaiting
            </span>
          ) : null}
        </h2>
        <PendingList items={pending} />
      </section>

      <section className="mt-12">
        <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
          Applied refreshes
        </h2>
        <AppliedList items={applied} />
      </section>
    </div>
  );
}
