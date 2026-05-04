# CLAUDE.md — UCNFI Committee Project

This is the project-specific operating manual. It supplements Zach's global CLAUDE.md (which lives in `~/Claude-Work/_context/`) with rules specific to this work.

Read this at the start of any session in this repo. Re-read before producing prose if the conversation has gone long.

## Project context

This repo holds the maintained-record system for the UC AI Steering Committee (UCNFI). It is the working substrate for:
- Survey design and reconciliation with member self-reports
- Working group composition for the eight Opportunity Areas
- Identifying who should lead, speak, or write on specific topics
- A revised member-facing committee one-pager (eventually)

It is **not** the source of truth for committee membership — the deck appendix is. It's the working enrichment layer on top.

## Files in this repo

- `schema/member.schema.json` — JSON Schema 2020-12, v1.0.0. Source of truth for record structure. Don't edit casually.
- `records/*.json` — 23 enriched member records. One file per member.
- `summary/pass1-aggregate-summary.md` — Patterns across all 23 records. Most useful starting context.
- `_context/institutional-context.md` — UC and UCSD reference facts. Names, roles, structures. Load when working on real institutional structures.
- `_context/responsible-ai-seed-principles.md` — Values for AI-enabled tools. Load when working on tools or features.
- `scripts/validate.py` — Validates records against schema.

## Working rules specific to this project

**Don't invent member facts.** If a record says nothing about a member's position on something, the answer is "we don't know yet, that's what self-report is for." Don't fill gaps with plausible-sounding inference. Pass 1 enrichment was deliberately public-record-only; the working assumption is that Pass 2 self-report and Pass 3 positions/sensitivities will fill in what's missing. Anything beyond the records is speculation and must be flagged as such.

**Use the schema.** Every record change runs through validation. New fields, new enum values, new field types — those are schema changes, not record changes. Bump the schema version (`record_meta.schema_version`) and document the change. Use the validate script before checking anything in.

**Source URLs need access dates.** The committee is a live institution. Roles change, titles change, centers get renamed. Every source URL in a record should carry a `accessed: YYYY-MM-DD` field so stale data is visible.

**`needs_attention` flags should be specific and actionable.** "Verify this title" is good. "This member's institutional context could be richer" is not. The point of these flags is that they can be acted on, either by Zach or by a reconciliation pass.

**The records are the authoritative artifact.** When summaries, one-pagers, or working group drafts are produced, they should be derived from the records, not from external memory. If a draft contains a claim about a member that isn't in their record, either the record needs updating or the draft is wrong.

## Voice rules (specific to UCNFI work)

The global voice rules apply. A few things specific to this project:

**Institutional-internal register.** Most output here goes to Zach, his manager, the committee co-chairs (Khosla, Williams, Palazoglu), or eventually committee members themselves. That means plain language, person-to-person, no consultant register, no systems-architect language. Match the register Zach uses with Selina or with the Chancellor's office.

**Don't conflate the new committee with the previous AI Council.** The Steering Committee (Khosla, Williams, Palazoglu as co-chairs; Kirschner and Zach as advisors) is a different body from the previous AI Council (Bui and Bustamante co-chairs; Williams was senior advisor). Three current Steering Committee members served on the previous Council: Crittenden, Moe, Han. Use the full body name on first reference.

**Don't position Zach as speaking on behalf of UC, UCSD, or OSI.** His role is advisory. He brings perspective and design; he doesn't decide things. Material that comes from this work should not have him issuing directives or making commitments on behalf of the institution.

**The eight OAs sit under one North Star: "AI for humans and humanity."** This was recently consolidated from the prior three pillars (Scale Ethical AI / Reshape Education / Uplift Humanity). The OAs themselves will be refined during the kickoff in June 2026. Don't treat the current OA framing as locked.

## What's been done

Pass 1 enrichment is complete. All 23 records validate. Patterns documented in `summary/pass1-aggregate-summary.md`. Key findings worth knowing before drafting:

- The deck appendix systematically undersells members. The committee is more credentialed than the deck suggests.
- OA-2 (strategic partnerships) and OA-5 (operational streamlining) have only one primary member each. Real coverage gaps.
- OA-1 and OA-6 are over-resourced relative to the others.
- An "infrastructure cluster" of six members (Williams, Gupta, Hagberg, Neely, Vigna, Dugan) covers OA-4 without external recruitment.
- A "critical AI bench" of four humanities scholars (Noble, Raley, Milburn, Zimmer) covers the humanities side of OA-1, with Milburn's CAIEF as a partner-of-opportunity.
- The two health-AI voices (Murray, Han) are structurally light for a UC system with six health systems.
- The committee skews senior-administrator-heavy. Three chancellors, the senate chair, multiple VPs/AVPs.

## What's open

In rough priority order:

1. **Schema v1.1.0 revisions** — see README "What's open" section. Decide before survey design.
2. **Survey instrument** — translate schema into member-facing language. Different framing for students.
3. **Committee one-pager** — replaces or supplements deck appendix. Member-facing.
4. **Working group composition draft** — with OA-2 and OA-5 gaps surfaced.

Pass 3 (positions and sensitivities) is deferred until after survey reconciliation.

## Things not to do in this repo

- Don't produce polished docx or PDF deliverables unless explicitly asked. The records and the markdown summary are the primary artifacts.
- Don't fold this work into TOOLS or WORKSHOPS workstreams. UCNFI is its own UCOP-track work.
- Don't propose work that crosses into ITS, OSI operational, or Academic Senate territory.
- Don't draft member-facing communications (survey instruments, one-pagers, etc.) until the schema and content decisions are settled. Drafts before decisions create the wrong kind of momentum.

---

*Last updated: 2026-05-02. This file should be treated as binding for work in this repo. If a rule here conflicts with a request, ask before deviating.*
