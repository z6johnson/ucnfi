# Activity log

Generated, not hand-edited. See `data/ucnfi-committee/enrichment-strategy.md`
("Daily activity log") for the cadence and curation rules.

## Layout

```
activity/
├── README.md           — this file
├── seen.json           — dedup ledger (sha256-prefix → first-seen ISO timestamp)
├── items/              — one JSONL per UTC date, append-only
│   └── YYYY-MM-DD.jsonl
└── digests/            — one Markdown per ISO week
    └── YYYY-Www.md
```

## Item shape

Each line in `items/YYYY-MM-DD.jsonl` is one `ActivityItem` (see
`lib/activity.ts` for the type). Tier 1 items come from configured
RSS/Atom feeds and the arXiv author API. Tier 2 items come from
LiteLLM web search. The `id` is a 32-hex prefix of `sha256(canonical_url)`
and is used as the dedup key in `seen.json`.

## Manual edits

Don't hand-edit `items/*.jsonl` or `seen.json`. If you want to:

- **Add a missing item by hand**: prefer adding the source URL to
  `data/ucnfi-committee/feeds.json` (RSS) and re-running the scan, so
  the same source surfaces it on the next pass too.
- **Delete a wrong item**: remove the line and also remove its `id`
  from `seen.json` so it can be re-evaluated; or leave the line and let
  the digest's grounding rules ignore it.
- **Re-run a digest**: delete the existing `digests/YYYY-Www.md` and
  run `npm run digest:weekly -- END_DATE=YYYY-MM-DD`.
