import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { baselineStats, metadata as baselineMeta } from "@/lib/baseline";

export const metadata: Metadata = {
  title: "UCNFI — UC Next Frontier Initiative",
  description:
    "Research, synthesis, and analytics for the UC Next Frontier Initiative Steering Committee.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const stats = baselineStats();
  const ageDays = Math.floor(
    (Date.now() - Date.parse(baselineMeta.created)) / 86_400_000,
  );
  const stale = Number.isFinite(ageDays) && ageDays > 45;
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-[1200px] px-6 md:px-10">
          <Nav />
          <main className="pb-24">{children}</main>
          <footer className="hairline mt-16 flex items-center justify-between py-6">
            <span className="label">UC Next Frontier Initiative</span>
            <div className="flex items-center gap-6">
              <Link
                href="/about#data-status"
                className="label hover:text-[var(--color-accent)]"
              >
                Data status
              </Link>
              <Link
                href="/about#data-status"
                className="label hover:text-[var(--color-accent)]"
                title={`Baseline as of ${baselineMeta.created}`}
              >
                <span className="label">
                  Baseline v{stats.version} · {stats.entityCount} entities ·{" "}
                  {stats.dataPointCount} data points · as of {baselineMeta.created}
                  {stale ? (
                    <span style={{ color: "var(--color-warn-strong)" }}>
                      {" "}
                      ({ageDays}d old)
                    </span>
                  ) : null}
                </span>
              </Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
