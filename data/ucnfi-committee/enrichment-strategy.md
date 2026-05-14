# Enrichment strategy

How committee member records stay current. Operational, not aspirational.

## What "enriched" means here

A record is enriched when its public-record-derivable fields (`primary_affiliation`, `secondary_affiliations`, `expertise_tags`, `opportunity_areas`, `role_facets`, `synopsis`, `sources`) reflect the current state of the world *and* every claim traces to a source URL with a recent access date. A record is reconciled when the member's `self_report` has been compared against the enrichment and any discrepancies have been resolved or flagged in `reconciliation`.

Pass 1 enriched all 23 records to schema v1.0.0 from public sources only. Pass 2 (synopsis + verification) is also done. Pass 3 (positions and sensitivities) is deferred until after self-report reconciliation.

## Inputs

In rough order of authority for any given member:

1. **Member self-report** — once submitted, leads on expertise tags and OA interest. Captured via the inaugural-meeting survey.
2. **Authoritative institutional bios** — UC department pages, school pages, lab/center pages. These move and rename, so always recheck before re-citing.
3. **Recent press, interviews, podcasts** — useful for current statements; flag the access date.
4. **Personal sites and publication lists** — useful for credentials and research focus; less authoritative on current title.
5. **Internal artifacts** — the deck appendix, prior committee documents. Cross-checked against public sources because the deck systematically undersells members (see `summary/pass1-aggregate-summary.md`).

`linkedin` and `wikipedia` are usable as supporting references but never as the single source for a claim. Both can drift.

## Cadence

- **Quarterly full pass.** Re-walk every record's primary affiliation, top secondary affiliations, and source access dates. Update `record_meta.last_verified` and `fields_updated_this_pass` on every record touched.
- **Ad-hoc when a member's role changes.** If a chancellor changes campuses, a center is renamed, or a member is promoted, update that record immediately and bump `last_verified`. Don't wait for the next full pass.
- **Always before a public artifact.** If the records will feed a one-pager, working group draft, or kickoff document, run the validator and re-check any record that hasn't been verified in 60+ days.

## Process for a single record

1. Pull the latest authoritative source for the member's primary role. Verify title, organization, unit/department.
2. Walk `enrichment.expertise_tags`. For each tag: re-read the cited evidence, confirm it still supports the tag at the listed confidence level. Adjust confidence if the public record has shifted.
3. Walk `enrichment.opportunity_areas`. Confirm primary and secondary mappings still fit. If a member's recent work has shifted them toward a new OA, add it as secondary rather than dropping an existing one — historical context matters for working-group composition.
4. Re-read `enrichment.synopsis`. If it cites a number, title, or affiliation that's changed, rewrite. Plain language, present tense, no marketing register.
5. Update each `enrichment.sources[].accessed` date for any source you actually re-opened.
6. If the member submitted a self-report and `reconciliation.status` is `not_yet_reconciled`, run a reconciliation pass: log additions, drops, and judgment calls. Don't silently overwrite member-claimed tags with enrichment-only ones.
7. Update `record_meta.last_verified` to today and append touched fields to `record_meta.fields_updated_this_pass`.
8. Run the validator (`npm run validate:committee` or `python data/ucnfi-committee/scripts/validate.py`). Both should pass before commit.

## Self-report intake

Until the in-app survey form ships, intake is:

1. Member receives the survey instrument (a member-facing translation of the schema's expertise tags, OAs, and a short free-text section).
2. Responses arrive in a shared form or doc.
3. Committee staff translates each response into the `self_report` block of the relevant record. No edits to `enrichment` at this stage.
4. Reconciliation pass populates `reconciliation` with status, decisions, and a `final_tags` list.

A staff intake takes ~15 minutes per member assuming the survey is structured. Reconciliation takes longer for members where enrichment and self-report disagree — that's signal, not noise.

## Validation

Two validators kept in sync:

- **`data/ucnfi-committee/scripts/validate.py`** — full JSON Schema 2020-12 check via `jsonschema`. Authoritative.
- **`scripts/validate-committee.ts`** — lightweight TS check that runs without Python. Catches the most common breakages: missing required fields, invalid enum values, member_id pattern, filename–id mismatch, OA codes, schema version drift, synopsis length, and `needs_attention` formatting.

The TS validator runs locally via `npm run validate:committee`. Either validator failing is a blocker for committing record changes.

## What's an `needs_attention` flag

Specific and actionable:

- `Verify Williams' unit name (DigIT vs. ITS) before next public artifact.`
- `Hagberg division title: 'Computing and AI Division Lead' vs. 'Computer, Computational, and Statistical Sciences Division Leader'.`

Not flags:

- `This record could use more depth.`
- `Member has interesting work in AI ethics.`

When a flag is resolved, remove it. The list is meant to shrink between passes.

## Schema versioning

Schema lives at `schema/member.schema.json`. Bumping requires:

1. A real reason (new field, enum value, type change). Changes are documented in `taxonomy-version-history.md` (when it exists) or in a commit message.
2. Updating `record_meta.schema_version` on every record at the same time, or providing a migration script that does so.
3. Both validators updated to reference the new schema.

The four candidate v1.1.0 changes surfaced by Pass 1 are listed in `summary/pass1-aggregate-summary.md`. Whether to apply them before survey design is a deliberate decision and not assumed here.

## Ownership

The records are the working artifact. Anyone with commit access can update a record, but every change should:

- Validate cleanly before commit.
- Update `last_verified` and `fields_updated_this_pass`.
- Cite the source for any new claim.
- Leave `needs_attention` cleaner than it found it.

Disputes about a member's framing get resolved with the member, not in the record. That's why `self_report` and `reconciliation` exist.

## Daily activity log

Between full enrichment passes, a daily scan tracks what each member is publishing or saying about AI in public. The output lives at `activity/` and is generated, not hand-curated.

- **Daily** (GitHub Actions, 13:00 UTC): `npm run scan:daily` polls the per-member feeds in `feeds.json` (RSS/Atom + arXiv author queries) and calls Claude through the UCSD TritonAI LiteLLM proxy with the server-side `web_search` tool for op-eds, podcasts, and press quotes. New items append to `activity/items/YYYY-MM-DD.jsonl`. The dedup ledger `activity/seen.json` keeps an item from showing up twice; ids older than 90 days are pruned.
- **Weekly** (GitHub Actions, 14:00 UTC Sunday): `npm run digest:weekly` reads the last seven days of items, calls Claude through the same LiteLLM proxy, and writes `activity/digests/YYYY-Www.md` grouped by topic and member, with a "flag for the next meeting" section.

The activity log does **not** modify member records. It's a candidate pool. When a member produces something substantive enough to belong in the record proper — a recurring position, a new public commitment, a venue that shifts how they're framed — that's a hand-promotion into `enrichment.synopsis` (or `pass_3_reserved` once that pass is opened) on the next pass through that record. The activity log doesn't override the public-record-only rule for Pass 1; it just makes the decision of what to promote much easier.

If a member's role changes and the activity scan is the first place we see it, treat that the same as any other ad-hoc trigger above: update the record immediately and bump `last_verified`.

To extend coverage for a member, add their RSS URL, arXiv author query, or search aliases to `data/ucnfi-committee/feeds.json`. Members without an entry still get tier-2 web-search coverage from their `name.full` and primary affiliation.
