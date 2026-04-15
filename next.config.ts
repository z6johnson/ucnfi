import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * The baseline JSON is loaded via readFileSync in lib/baseline.ts so
   * it stays out of the webpack import graph (which OOM-killed the
   * Vercel build traces step). This tracing-includes entry makes sure
   * the file is copied into the /api/chat serverless function bundle,
   * where the loader runs at request time rather than build time.
   */
  outputFileTracingIncludes: {
    "/api/chat": ["./data/uc_ai_baseline.json"],
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
