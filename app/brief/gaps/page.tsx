import Link from "next/link";
import { GapMatrixTable } from "@/components/brief/GapMatrix";
import { computeGapMatrix } from "@/lib/brief/gaps";

export const metadata = {
  title: "Gaps — UCOP",
  description:
    "UC's position vs. the field — per dimension, where UC has a clear position, where it's silent, where campuses contradict each other, and where peers have done something UC hasn't.",
};

export default function BriefGapsPage() {
  const matrix = computeGapMatrix();
  return (
    <div className="pt-8">
      <Link href="/brief" className="label">
        ← The Brief
      </Link>
      <header className="mt-4">
        <span className="label">UCOP · Position vs. the field</span>
        <h1 className="display mt-2">
          Where UC has a position, where it&apos;s silent, where peers are ahead
        </h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          The gaps are the work. Counts are derived from the UC baseline and
          the peer baseline at render time. Click a dimension to see the
          field-level evidence.
        </p>
      </header>
      <GapMatrixTable matrix={matrix} />
    </div>
  );
}
