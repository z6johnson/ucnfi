import Link from "next/link";

type Props = {
  section: string;
  step: string;
  children: React.ReactNode;
};

export function ComingSoon({ section, step, children }: Props) {
  return (
    <div className="pt-12">
      <span className="label">UCNFI · {section}</span>
      <h1 className="display mt-2">{section}</h1>
      <p
        className="prose-body mt-4 max-w-2xl"
        style={{ color: "var(--color-text-muted)" }}
      >
        {children}
      </p>
      <div
        className="rail-accent mt-8 max-w-xl"
        style={{ borderLeftColor: "var(--color-warn)" }}
      >
        <span className="label" style={{ color: "var(--color-warn-strong)" }}>
          Arrives in {step}
        </span>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--color-text-muted)" }}
        >
          This surface is planned in <code>docs/v1-plan.md</code>. It has
          intentionally not been wired up yet so Step 1 (baseline explorer)
          ships first.
        </p>
      </div>
      <div className="mt-8">
        <Link href="/baseline" className="label">
          → Browse the baseline in the meantime
        </Link>
      </div>
    </div>
  );
}
