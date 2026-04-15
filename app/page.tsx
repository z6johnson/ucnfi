import Link from "next/link";
import { Stat } from "@/components/Stat";
import { PillarTag } from "@/components/PillarTag";
import {
  opportunityAreas,
  pillars,
  researchTopics,
  pillarFor,
} from "@/content/northstar";
import { baselineStats } from "@/lib/baseline";

export default function DashboardPage() {
  const stats = baselineStats();

  return (
    <div className="pt-12">
      <section>
        <span className="label">UCNFI · Overview</span>
        <h1 className="hero mt-2 max-w-3xl">
          Research, synthesis, and analytics for the UC Next Frontier
          Initiative Steering Committee.
        </h1>
        <p
          className="prose-body mt-6 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          A working surface over the Phase 0 AI governance baseline —
          20 entities, {stats.dataPointCount} data points across ten
          dimensions — organized around the three pillars of the UCNFI
          North Star and the eight opportunity areas beneath them.
        </p>
      </section>

      <section className="hairline mt-12 grid grid-cols-2 gap-8 pt-6 md:grid-cols-4">
        <Stat label="Entities" value={stats.entityCount} />
        <Stat
          label="Data points"
          value={stats.dataPointCount}
          hint={`Baseline v${stats.version}`}
        />
        <Stat
          label="Campuses"
          value={stats.byType.campus}
          hint={`${stats.byType.health_system} health · ${stats.byType.national_lab} labs`}
        />
        <Stat label="Opportunity areas" value={opportunityAreas.length} />
      </section>

      <section className="mt-16">
        <h2 className="display">North Star</h2>
        <div className="mt-6 grid gap-8 md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.id}
              className="rail-accent"
              style={{ borderLeftColor: `var(${pillar.cssVar})` }}
            >
              <PillarTag pillar={pillar} />
              <h3
                className="mt-2 text-lg font-bold"
                style={{ color: "var(--color-ink)" }}
              >
                {pillar.name}
              </h3>
              <p
                className="prose-body mt-2"
                style={{ color: "var(--color-text-muted)" }}
              >
                {pillar.statement}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <div className="hairline flex items-baseline justify-between pb-2">
          <h2 className="display">Opportunity Areas</h2>
          <span className="label">8 total</span>
        </div>
        <div className="mt-6 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {opportunityAreas.map((oa) => {
            const pillar = pillarFor(oa.id);
            return (
              <article
                key={oa.id}
                className="rail-accent"
                style={{ borderLeftColor: `var(${pillar.cssVar})` }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="label">OA-{oa.number}</span>
                  <PillarTag pillar={pillar} />
                </div>
                <h3
                  className="mt-1 text-base font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {oa.title}
                </h3>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {oa.summary}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-16">
        <div className="hairline flex items-baseline justify-between pb-2">
          <h2 className="display">Research Topics</h2>
          <span className="label">Phase 0 → Phase 1</span>
        </div>
        <ol className="mt-6 flex flex-col gap-4">
          {researchTopics.map((topic) => (
            <li key={topic.number} className="flex gap-4">
              <span
                className="label shrink-0 pt-1"
                style={{ minWidth: "3rem" }}
              >
                RT-{topic.number}
              </span>
              <p
                className="prose-body"
                style={{ color: "var(--color-text-muted)" }}
              >
                {topic.prompt}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <div className="hairline flex items-baseline justify-between pb-2">
          <h2 className="display">Start here</h2>
        </div>
        <ul className="mt-6 flex flex-wrap gap-6">
          <li>
            <Link href="/entities" className="label">
              → Browse the baseline
            </Link>
          </li>
          <li>
            <Link href="/chat" className="label">
              → Ask the AI research copilot
            </Link>
          </li>
          <li>
            <Link href="/memos" className="label">
              → Draft a committee memo
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
