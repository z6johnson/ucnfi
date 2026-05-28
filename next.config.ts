import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Files loaded via readFileSync at request time need explicit tracing
   * entries so Vercel copies them into the serverless function bundle.
   * Webpack's static analysis can't follow dynamically-constructed paths
   * (e.g. today's `YYYY-MM-DD.jsonl`), so the activity page would otherwise
   * see an empty directory in production.
   *
   * - /api/chat: baseline JSON kept out of the import graph to avoid the
   *   Vercel build-trace OOM that motivated this pattern.
   * - /activity: per-day JSONL items, weekly digest markdown, and the
   *   committee records read by lib/committee.ts at request time.
   */
  outputFileTracingIncludes: {
    "/api/chat": ["./data/uc_ai_baseline.json"],
    "/activity": [
      "./data/ucnfi-committee/activity/items/*.jsonl",
      "./data/ucnfi-committee/activity/digests/*.md",
      "./data/ucnfi-committee/records/*.json",
    ],
    "/brief": ["./data/brief/editions/*.md"],
    "/brief/[edition_id]": ["./data/brief/editions/*.md"],
  },
  async redirects() {
    return [
      {
        source: "/entities",
        destination: "/baseline",
        permanent: true,
      },
      {
        source: "/entities/:id",
        destination: "/baseline/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
