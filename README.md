# UCNFI

**UC Next Frontier Initiative — research, synthesis, and analytics platform.**

A Next.js web app over the Phase 0 AI governance baseline dataset (20 entities, 219 data points, 10 dimensions) with a grounded Claude copilot for cross-cutting analysis and committee memo drafting. Organized around the three pillars and eight Opportunity Areas of the UCNFI North Star.

## Status

| | Step | What it adds |
|---|---|---|
| ✓ | **Step 1 — Baseline Explorer** | Dashboard, entity index, entity detail pages, NFI design tokens. No runtime dependencies. |
| ☐ | **Step 2 — Grounded Chat** | Streaming Claude chat with baseline prompt caching and `query_baseline` tool use. |
| ☐ | **Step 3 — Persistence + Shares** | Postgres + Drizzle, saved chats, admin cookie gate, read-only share links. |
| ☐ | **Step 4 — Memos + Comparison** | Memo drafting, cross-entity comparison matrix, OA pages. |
| ☐ | **Step 5 — Polish** | Copy pass, seeded published memos, custom domain, analytics. |

Full plan: [`docs/v1-plan.md`](docs/v1-plan.md).

## Quickstart

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No environment variables are required for Step 1 — the baseline JSON is read at build time and every page is prerendered.

Type check and production build:

```bash
npm run typecheck
npm run build
```

## Repository layout

```
app/          Next.js App Router pages and API routes
components/   React components aligned to docs/seed-style-guide.md
content/      Single source of truth for pillars, OAs, research topics
lib/          Typed loader and query layer over the baseline JSON
data/         Phase 0 baseline dataset (v0.6.0) and enrichment tooling
docs/         Plan, principles, style guide
```

Key files:

- [`data/uc_ai_baseline.json`](data/uc_ai_baseline.json) — the Phase 0 dataset (source of truth)
- [`data/ENRICHMENT_LOG.md`](data/ENRICHMENT_LOG.md) — dataset version history and gaps
- [`content/northstar.ts`](content/northstar.ts) — pillars, Opportunity Areas, research topics
- [`lib/baseline.ts`](lib/baseline.ts) — typed accessors (`listEntities`, `getEntity`, `queryBaseline`, `baselineStats`)
- [`docs/v1-plan.md`](docs/v1-plan.md) — approved v1 implementation plan
- [`docs/responsible-ai-seed-principles.md`](docs/responsible-ai-seed-principles.md)
- [`docs/seed-style-guide.md`](docs/seed-style-guide.md)

## Design system

Design tokens in [`app/globals.css`](app/globals.css) derive from the seed style guide and the NFI color palette — warm-neutral base, single brand accent (`#005581`), and a disciplined set of semantic tokens. The full mapping lives under **NFI color tokens** in [`docs/v1-plan.md`](docs/v1-plan.md).

Fonts fall back to system sans for UI and system serif for memo body. No external font loading is wired up yet — add Inter / Source Serif 4 via `next/font` in Step 5 if desired.

---

## Deployment — Vercel

The app is a stock Next.js 15 project. Vercel's framework preset auto-detects everything; install command, build command, and output directory can stay on their defaults.

General project settings (applied once at import):

- **Framework preset:** Next.js (auto)
- **Root directory:** repo root (`./`)
- **Node.js version:** 20.x
- **Function region:** `sfo1` or `pdx1` for low-latency California access (Project Settings → Functions → Region)

### Step 1 — Baseline Explorer

**No configuration needed.**

1. Import the GitHub repo into Vercel.
2. Accept the auto-detected Next.js preset.
3. Deploy.

Every page is prerendered at build time (28 static pages, including all 20 entity detail pages), so the deployment is effectively a static site with zero runtime dependencies. No environment variables, no database, no secrets.

### Step 2 — Grounded Chat

Adds the Anthropic Claude SDK (`@anthropic-ai/sdk`) and a streaming `/api/chat` route with prompt caching of the full baseline.

**Environment variables** (Project Settings → Environment Variables — add to Production, Preview, and Development):

| Name | Value | Sensitive |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | ✓ |

**Function duration.** The `/api/chat` route will export `maxDuration = 60` so Vercel allows long-running streams. On Vercel's Hobby plan, Serverless Function duration is capped — upgrade to Pro if streaming responses are getting truncated.

**Runtime.** Node runtime (not Edge) so the Anthropic SDK's prompt caching and streaming helpers work without shimming.

No database yet — chat history lives in the browser (URL/localStorage) until Step 3.

### Step 3 — Persistence + Share Links

Adds Postgres + Drizzle ORM, saved chats, admin cookie gate, and `/share/[slug]` read-only resolver.

**1. Provision Postgres.** In Vercel: **Storage → Create Database → Neon Postgres**. Link it to the project. Neon auto-injects `DATABASE_URL` (and `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, etc.) into Production and Preview environments.

**2. Add environment variables:**

| Name | Value | Sensitive | Notes |
|---|---|---|---|
| `ADMIN_PASSWORD` | Strong random string | ✓ | Gates Zach's editing routes via an HTTP-only cookie |
| `NFI_BASE_URL` | `https://<project>.vercel.app` or your custom domain | — | Used to build absolute share URLs |

**3. Run migrations once** against the Neon database from your local machine:

```bash
# Pull env vars from Vercel into a local .env
npx vercel env pull .env.local

# Push the Drizzle schema to Neon
npm run db:push
```

The `db:push` script will be added in Step 3 and wraps `drizzle-kit push`. Preview deployments automatically share the same database in this setup — if you want isolated preview DBs, create a second Neon branch and scope `DATABASE_URL` to the Preview environment.

### Step 4 — Memos + Comparison

**No new infrastructure.** Reuses `ANTHROPIC_API_KEY` (for `/api/memo/generate`) and `DATABASE_URL` (for the new `memos` table). Run `npm run db:push` once after the migration lands.

The comparison matrix is a pure read over the baseline JSON — no additional config.

### Step 5 — Polish

No required config changes. Optional:

- **Custom domain** — Project Settings → Domains → add your hostname and follow Vercel's DNS instructions. Update `NFI_BASE_URL` to match.
- **Vercel Analytics** — toggle on from the project dashboard for page-view counts and Web Vitals.
- **Seed memos** — once `/api/memo/generate` is live, seed a handful of published committee memos (campus maturity gradient, governance gap summary, health AI snapshot) and copy their share URLs into the committee comms.

---

## Environment variable summary

| Variable | Step introduced | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Step 2 | Claude API for chat + memo generation |
| `DATABASE_URL` | Step 3 | Neon Postgres connection string |
| `ADMIN_PASSWORD` | Step 3 | Admin cookie gate for editing routes |
| `NFI_BASE_URL` | Step 3 | Absolute URL used when generating share links |

See [`.env.example`](.env.example) for the local template.
