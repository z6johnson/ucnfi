# UCNFI Committee Records

Maintained-record system for the UC AI Steering Committee (UCNFI). Twenty-three members enriched in Pass 1, validated against schema v1.0.0. Working files for further development of the survey instrument, working group assignments, and reconciliation workflow.

## What this is

A self-report-plus-verification system. The records here are what's been compiled from public sources and the deck appendix. The next phase is a member-facing survey that asks each committee member to confirm or correct their record, then a reconciliation pass.

The records are reference material for two near-term decisions:
- Working group assignments for the eight Opportunity Areas
- Identifying members to lead, speak, or write on specific topics

The intent is for this to be a **maintained record**, not a snapshot. Members move, titles change, opportunity areas refine. The schema is built for that.

## Layout

```
ucnfi-committee/
├── CLAUDE.md                          # voice and working rules
├── README.md                          # this file
├── _context/
│   ├── institutional-context.md       # UC and UCSD reference facts
│   └── responsible-ai-seed-principles.md
├── schema/
│   └── member.schema.json             # JSON Schema 2020-12, v1.0.0
├── records/                           # 23 member records, one per file
│   └── *.json                         # filename = member_id
├── summary/
│   └── pass1-aggregate-summary.md     # patterns across all 23 records
└── scripts/
    └── validate.py                    # validates records against schema
```

## Schema (v1.0.0)

`schema/member.schema.json` defines the structure. Top-level fields:

- `member_id` — slug pattern `lastname-firstinitial` (matches filename)
- `name` — full, first, last, optional preferred and pronouns
- `primary_affiliation` — current title and organization
- `secondary_affiliations` — array of additional roles
- `committee_role` — role on UCNFI plus what they `represent`
- `enrichment` — the working record
  - `expertise_tags` — controlled-vocab tags with confidence and evidence
  - `opportunity_areas` — OA-1 through OA-8 mappings, primary or secondary
  - `role_facets` — sector, AI relationship, governance orientation
  - `synopsis` — 200-1200 char human-readable summary
  - `sources` — URLs with type and access date
  - `pass_3_reserved` — reserved for positions/sensitivities pass
- `self_report` — populated when member returns survey
- `reconciliation` — populated when self-report and enriched record are reconciled
- `record_meta` — version, last verified, fields updated this pass, `needs_attention` flags

Run `python scripts/validate.py` to check everything. Run `python scripts/validate.py records/foo.json` to check one.

## What's done (Pass 1)

All 23 committee members enriched from public sources and the deck appendix. Records validate. Patterns documented in `summary/pass1-aggregate-summary.md`. Most-useful sections of that summary:

- The OA mapping table (which OAs are well-covered, which are thin)
- The clusters (infrastructure cluster, critical AI bench, health voice, senior-administrator skew)
- Committee-level corrections to surface before kickoff (name and title fixes)
- Schema and taxonomy revisions to consider before survey design

## What's open

In rough priority order:

**1. Schema v1.1.0 revisions.** Four small fixes Pass 1 surfaced:
- Add `public_interest_advocacy` to `governance_orientation` enum (Noble, Milburn need it; current draft uses `state_policy` as workaround)
- Consider `affected_population` value for `ai_relationship` (student members fit awkwardly under `user_representative`)
- Possibly collapse some expertise tags (network/connectivity is always paired with embedded systems; health AI vs health data governance is borderline)
- Add structured tracking for profile-doc-vs-public-record discrepancies (came up in nearly every record)

Whether to bump before survey design is a deliberate decision — the schema affects how the survey is built.

**2. Survey instrument design.** Translates the schema's expertise tags and opportunity areas into member-facing language. The instrument needs to:
- Feel like a self-description exercise, not a tagging task
- Use different framing for student members (their value is lived experience, not tagged expertise)
- Ask what each member would want to lead, contribute to, or stay out of
- Capture what's missing from the public record

**3. Committee one-pager.** The deck appendix systematically undersells members. A revised member-facing one-pager based on these enriched records would land better at kickoff. Source material is in `summary/pass1-aggregate-summary.md` plus the individual records.

**4. Working group composition draft.** With Pass 1 done, you can sketch initial working group lineups for each OA. The OA-2 and OA-5 coverage gaps are the constraints worth surfacing first.

## What Pass 3 will do (deferred)

The schema reserves a `pass_3_reserved` field for positions and sensitivities — what each member has publicly said about AI policy questions, what their stated commitments are, where they are likely to push back. Not done in Pass 1. Will come after survey reconciliation, since self-report may shift the ground.

## Conventions

- File naming: `{lastname}-{firstinitial}.json`, lowercase, matches `member_id`
- Schema version goes in every record's `record_meta.schema_version`
- Source URLs include access date (YYYY-MM-DD) so stale data is visible
- `needs_attention` flags should be specific and actionable, not general observations
- Every claim in `expertise_tags.evidence` should be verifiable from the listed sources
- The synopsis is what a human reads. It should hold up without the structured fields above it

## Activity log

`activity/` is the daily/weekly heartbeat between full enrichment passes — a record of what each member has been publishing or saying about AI in public. It is **generated, not hand-edited**: a GitHub Actions workflow runs `npm run scan:daily` once a day (RSS/Atom + arXiv + LiteLLM web search) and `npm run digest:weekly` once a week (Anthropic API), and commits both back to this directory.

- Per-member feed sources live in `feeds.json`. Add an RSS URL or arXiv author query for a member and the next daily run picks it up.
- Daily items: `activity/items/YYYY-MM-DD.jsonl`
- Weekly digests: `activity/digests/YYYY-Www.md`
- Dedup ledger: `activity/seen.json`

See `activity/README.md` for layout, `enrichment-strategy.md` for cadence and the rule that recurring items get hand-promoted into the relevant member record on the next quarterly pass.

## Related projects

The maintained-record system here is conceptually similar to the work being done in TOOLS for the Privacy Office, Research Alignment, and other UCSD-internal systems. Schema and validation patterns can probably be lifted between projects. The voice rules in CLAUDE.md and the seed docs in `_context/` are shared across all of Zach's work.
