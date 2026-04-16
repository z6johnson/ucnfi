# UCNFI Research, Synthesis & Analytics Platform — v1 Plan

## Context

The UC Next Frontier Initiative (UCNFI) Steering Committee was reconstituted April 2026 (Khosla/Williams co-chairs; Palazoglu and Kirschner advising). It operates against a **North Star** with three pillars and eight Opportunity Areas:

- **SCALE ETHICAL AI** — OA-1 Trusted AI Standard · OA-2 Strategic Expansion & Economic Partnerships · OA-3 National AI Literacy
- **RESHAPE EDUCATION** — OA-4 AI Infra Development · OA-5 Operational Streamlining & Capital Reallocation · OA-6 21st Century Public University
- **UPLIFT HUMANITY** — OA-7 Interdisciplinary Solutions for Grand Challenges · OA-8 360° Health Intelligence

Zach has already seeded a rich baseline: `data/uc_ai_baseline.json` (v0.6.0, 20 entities across campuses, health systems and national labs; 219 data points across 10 governance dimensions) plus source markdown captures, responsible-AI seed principles, and the seed style guide in `docs/`.

What's missing is a place to *work* with that baseline: a tool for Zach to explore it, ask cross-cutting questions with an AI copilot grounded in the actual data, and produce share-ready artifacts for the committee. A near-term deliverable — a presentable prototype — is the driver.

**This plan describes that application.** It is a Next.js web app hosted on Vercel that pairs a Baseline Explorer with a grounded AI Chat, plus memo drafting and read-only share links. Built from scratch in this repo.

---

## v1 Scope (optimized for speed to "presentable")

**In:**

1. **Dashboard** — North Star + 8 OAs + 8 research topics, quick stats, links to recent artifacts.
2. **Baseline Explorer** — filterable index of 20 entities; entity detail pages showing every dimension, field value, source id, source URL, and notes exactly as stored in the JSON.
3. **Grounded AI Chat** — streaming chat with Claude, system-primed with the North Star/OAs/research topics and full baseline (prompt-cached). Structured tool use so answers cite specific entities/fields. Saveable and shareable.
4. **Memo view** — short markdown artifacts (editable by Zach, shareable). Memos can be generated from a chat or from a selected entity/dimension slice.
5. **Read-only share links** — unguessable slugs for a chat, a memo, or an entity comparison view. No login. Clean public layout.
6. **NFI branding + seed style guide** — typography-led layout, achromatic palette, NFI accent color (pending palette from Zach). Committee-presentable.

**Explicitly out of v1 (deferred to v1.1+):**

- Multi-user auth / comments / co-authoring
- Research topic workspaces per-OA with evidence boards
- Automated landscape/web enrichment (external AI ethics leaders, state/national signals)
- Expertise graph for steering committee / advisory board
- Writing back to the baseline JSON from the UI
- Webhook/cron-based data refresh pipelines

---

## Architecture

### Stack

- **Next.js 15** (App Router, React 19, TypeScript) — single project at repo root
- **Tailwind CSS v4** with tokens derived from `docs/seed-style-guide.md`
- **Anthropic SDK** (`@anthropic-ai/sdk`) pointed at the **UCSD TritonAI LiteLLM proxy** (`https://tritonai-api.ucsd.edu`) for Claude, using **Claude Opus 4.6** (`claude-opus-4-6-v1`) as the default model and **prompt caching** for the baseline payload
- **Vercel Postgres** (or Neon) via **Drizzle ORM** for the small amount of mutable state (memos, saved chats, share slugs). Keeps deploys simple on Vercel.
- **Basic gate** for Zach's editing routes: a single `ADMIN_PASSWORD` env var behind a cookie-based auth. Public `/share/[slug]` routes bypass the gate.
- **Deploy:** Vercel, with `LITELLM_API_KEY`, `DATABASE_URL`, `ADMIN_PASSWORD`, `NFI_BASE_URL` as env vars.

### Data model

`data/uc_ai_baseline.json` is read at build time and also exposed to API routes via a server-only loader. No DB writes for baseline content in v1.

Drizzle schema (Postgres):

- `memos(id, slug, title, body_md, is_public, public_slug, created_at, updated_at)`
- `chats(id, slug, title, created_at)`
- `chat_messages(id, chat_id, role, content, citations_json, created_at)`
- `shares(id, target_type ENUM['memo','chat','comparison'], target_id, slug, created_at)`

### Baseline access layer — `lib/baseline.ts`

One module responsible for:

- Loading `uc_ai_baseline.json` once (module-scope cache)
- `listEntities()`, `getEntity(id)`, `listDimensions()`, `queryBaseline({ entityIds?, dimensions?, fields?, valueFilter? })`
- Producing a compact, token-efficient projection for Claude tool-use results (strip `notes` when long; include `source_id`, `source_url`)
- Index by entity, by dimension, by `has_*` presence flags for fast filtering

### AI layer — `lib/claude.ts` + `app/api/chat/route.ts`

- **System prompt** (static, cache-breakpoint):
  1. UCNFI mission + North Star + 8 OAs + 8 research topics (verbatim from Zach's brief)
  2. Responsible AI seed principles (from `docs/responsible-ai-seed-principles.md`)
  3. Style guide for response formatting (terse, structural, cite sources)
  4. **Full `uc_ai_baseline.json`** inlined as a second cache breakpoint so every turn reuses the cache
- **Tool use** — Claude is given one tool, `query_baseline`, with args `{entityIds?, dimensions?, fields?}` and returns JSON projections. This prevents hallucinated field values and produces reliable citation payloads.
- **Citations** — each assistant turn returns an array of `{entity_id, dimension, field, source_id, source_url}` alongside the prose; frontend renders them as chips under the message and inline markers like `[ucop-02]`.
- **Streaming** — Server-Sent Events via Next's streaming Response; client renders token-by-token.
- **Memo generation** — `/api/memo/generate` takes `{brief, scope}` where scope is entity/dimension selections; returns a draft markdown memo with inline citations. Reuses the same system prompt + cache.

### Design system

Applied from `docs/seed-style-guide.md`:

- Single sans-serif for UI (Inter) + serif for memo reading (Source Serif 4)
- 4px base grid; tokens in `app/globals.css` (`--space-1` … `--space-12`, `--type-xs` … `--type-display`)
- Warm-neutral achromatic base (from the NFI palette) with **one primary brand accent** and a disciplined set of semantic colors — see "NFI color tokens" below
- No container borders; hairline dividers; left-edge accent on priority cards
- Label register: small, bold, uppercase, wide-tracked, muted — used for dimension tags, source ids, entity type badges
- Focus: solid outline, no glow
- Motion: 120–200ms, no entrance animations

### NFI color tokens

The seed style guide prescribes an achromatic working palette with color reserved for semantic meaning. The NFI palette maps cleanly to that discipline — warm neutrals carry the system, deep navy is the one brand accent, and the saturated colors are held back for specific states.

```
/* Surface / neutrals — warm */
--bg:            #ffffff;
--bg-muted:      #dbd5cd;   /* page wash, empty states */
--border-hair:   #beb6af;   /* hairline dividers */
--border-heavy:  #8f8884;   /* emphasis dividers */
--text-subtle:   #7c7e7f;   /* metadata, source ids */
--text-muted:    #4c4c4c;   /* secondary copy */
--text:          #171717;   /* primary text */
--ink:           #002033;   /* display type, serif memo body */

/* Brand accent — single */
--accent:        #005581;   /* links, active state, left-edge card rail */
--accent-hover:  #1295d8;
--accent-wash:   #bde3f6;   /* focused row, selected chip background */
--focus-ring:    #1295d8;

/* Semantic (used sparingly, never decoratively) */
--info:          #00778b;   /* neutral info, teal badges */
--info-bright:   #00a3ad;
--success:       #72cdf4;   /* confirmations on dark surfaces */
--warn:          #ffb511;   /* caution, "draft", unverified data */
--warn-strong:   #ff8f28;
--danger:        #ff6e1b;   /* errors, broken source links */
--highlight:     #ffd200;   /* citation-hover, "new since" marker */
--highlight-soft:#ffe552;

/* Editorial accents — reserved for memo callouts & OA pillar tags only */
--pillar-scale:  #005581;   /* SCALE ETHICAL AI */
--pillar-reshape:#00778b;   /* RESHAPE EDUCATION */
--pillar-uplift: #e44c9a;   /* UPLIFT HUMANITY */
--pillar-uplift-soft: #feb2e0;
```

Rules of use:

- **Default state is neutral.** Body text on `--bg`, dividers at `--border-hair`, metadata in `--text-subtle`. No color unless the element carries state.
- **`--accent` is the only clickable-indicator color.** Links, active nav, selected chip, primary button fill.
- **Pillar tokens** are used only to tint the small pillar label chip on dashboards, OA pages, and memo frontmatter — never as a background wash or card fill.
- **Semantic tokens** appear on icons, left-edge rails, and small labels. They never become large color fields.
- Grayscale fallback: every colored element pairs with weight, position, or text so the UI remains legible if the user is colorblind or the palette is disabled.

### Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard: pillars, OAs, research topics, stats, recent chats/memos |
| `/entities` | Explorer: filter by entity type, dimension presence, search by name/notes |
| `/entities/[id]` | Entity detail: every dimension, every field, source links, notes |
| `/compare` | Cross-entity comparison matrix: pick entities + dimensions, render grid |
| `/oa/[slug]` | Opportunity Area page: description, research topics, pre-seeded chat prompts, related entities |
| `/chat` | New chat session |
| `/chat/[id]` | Saved chat with citations, "Share" and "Draft memo from this" actions |
| `/memos` | Memo list |
| `/memos/[id]` | Memo view/edit (admin) or read-only (public) |
| `/share/[slug]` | Public resolver that renders chat / memo / comparison without admin chrome |
| `/login` | Single-field password gate (sets HTTP-only cookie) |

---

## Files to create

Create a fresh Next.js project at repo root (keep `data/` and `docs/` intact; leave existing `README.md` alone except for a brief "how to run" addition).

Top level:

- `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `drizzle.config.ts`, `.env.example`, `.gitignore`

App:

- `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- `app/entities/page.tsx`, `app/entities/[id]/page.tsx`
- `app/compare/page.tsx`
- `app/oa/[slug]/page.tsx`
- `app/chat/page.tsx`, `app/chat/[id]/page.tsx`
- `app/memos/page.tsx`, `app/memos/[id]/page.tsx`
- `app/share/[slug]/page.tsx`
- `app/login/page.tsx`
- `app/api/chat/route.ts`
- `app/api/memo/generate/route.ts`
- `app/api/memo/[id]/route.ts` (PATCH for edits)
- `app/api/share/route.ts` (POST to create share slug)

Lib:

- `lib/baseline.ts` — load + query the JSON
- `lib/claude.ts` — Anthropic client, system prompt assembly, prompt caching, tool definition
- `lib/db.ts` — Drizzle client
- `lib/schema.ts` — Drizzle schema
- `lib/auth.ts` — admin cookie gate
- `lib/citations.ts` — shared citation types

Components:

- `components/Nav.tsx`
- `components/EntityCard.tsx`, `components/EntityTable.tsx`, `components/DimensionSection.tsx`
- `components/ComparisonMatrix.tsx`
- `components/ChatStream.tsx`, `components/CitationChip.tsx`, `components/PromptStarter.tsx`
- `components/MemoEditor.tsx`, `components/MemoView.tsx`
- `components/ShareButton.tsx`, `components/ShareBanner.tsx`
- `components/Label.tsx`, `components/Stat.tsx` (design-system primitives)

Content:

- `content/northstar.ts` — typed object with pillars, OAs, research topics (from Zach's brief). Single source of truth for dashboard, OA pages, and Claude system prompt.

Do **not** create:

- A separate backend
- Any test framework scaffolding (v1 is UI-verified)
- A component library dependency (Radix/shadcn) — keep primitives hand-rolled per style guide

---

## Reused existing material

- `data/uc_ai_baseline.json` — the product's core content, unchanged
- `docs/responsible-ai-seed-principles.md` — embedded in Claude system prompt; also rendered verbatim on an `/principles` link in the footer
- `docs/seed-style-guide.md` — the design spec; tokens implemented literally from its guidance
- Nothing from `data/enrich_v060.py` or `data/download_all.sh` is needed at runtime; they stay as-is for future enrichment runs

---

## Delivery steps (to hit "presentable fast")

**Step 1 — Skeleton + Explorer (standalone-usable):**
`package.json` + Next app + design tokens + `lib/baseline.ts` + `/`, `/entities`, `/entities/[id]`. No DB, no AI. Shippable as a static read-only artifact on day one.

**Step 2 — Grounded Chat:**
Add `lib/claude.ts`, `/api/chat`, `/chat`. System prompt with baseline caching + `query_baseline` tool. Citation rendering. No persistence yet (chats live in URL/localStorage).

**Step 3 — Persistence + Shares:**
Add Vercel Postgres + Drizzle schema, `chats` + `chat_messages` tables, save-chat action, `/share/[slug]` resolver, admin cookie gate.

**Step 4 — Memos + Comparison:**
`memos` table, `MemoEditor`, `/api/memo/generate`, `/compare` matrix, `/oa/[slug]` pages.

**Step 5 — Polish for committee preview:**
NFI color palette applied, copy pass, dashboard stats, seed a few published memos covering obvious baseline slices (campus maturity gradient, governance gap summary, health AI snapshot).

Each step is independently deployable to Vercel so there's something to show after every one.

---

## Verification plan

- `npm run dev` and walk the full flow in a browser: dashboard → explorer → entity detail → chat → save chat → generate memo → publish share link → open share link in incognito.
- Seed questions to the grounded chat (manual smoke tests, in order):
  1. "Which UC campuses have a formal AI council, and which don't?" — expect tool call against governance dimension, answer citing entity ids.
  2. "Summarize differences between UCSD TritonAI and UCLA's OAI." — expect Claude to pull infrastructure/policy fields for both and contrast them.
  3. "Where are the biggest gaps in health AI governance across the UC health systems?" — expect `health_ai` dimension query and grounded gap analysis.
  4. "Draft a one-page memo for OA-1 Trusted AI Standard that identifies three systemwide gaps." — expect structured memo output with citations.
- Confirm prompt cache hit rate > 90% on the second and subsequent turns (check Anthropic response `usage.cache_read_input_tokens`).
- Deploy a Vercel preview; open `/share/<slug>` from a logged-out browser and confirm read-only rendering, no admin chrome.
- `npm run build` + `npm run typecheck` clean.

---

## Open items

None blocking. NFI color palette and Anthropic API key are in hand. Committee meeting date, steering/advisory roster, and existing NFI visual assets are intentionally deferred — v1 does not require them.
