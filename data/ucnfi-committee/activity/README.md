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
RSS/Atom feeds and the arXiv author API. Tier 2 items come from the
UCSD TritonAI LiteLLM proxy with the `web_search_20260209`
server-side tool. The `id` is a 32-hex prefix of `sha256(canonical_url)`
and is used as the dedup key in `seen.json`.

## Manual edits

Don't hand-edit `items/*.jsonl` or `seen.json`. If you want to:

- **Add a source by hand (link, pasted text, or a file)**: use the
  admin-gated **Add a source** flow at `/activity/new` (linked from the
  top of `/activity`). It writes an `ActivityItem` with
  `source_kind: "manual"`, appends it to today's `items/<date>.jsonl`,
  records the `id` in `seen.json`, and — for pasted text or uploads —
  commits the archived asset under `public/activity-uploads/`. All of
  this lands in a single commit via the GitHub Data API
  (`lib/github.ts` `commitFiles`), so the item shows up after the next
  rebuild. Filter the feed by **Source → Added** to see manual items.
  Gated by `ADMIN_PASSWORD`; reuses `GITHUB_TOKEN`/`GITHUB_REPO`/`GITHUB_BRANCH`.
- **Add a recurring source**: prefer adding its URL to
  `data/ucnfi-committee/feeds.json` (RSS) and re-running the scan, so
  the same source surfaces automatically on every pass.
- **Delete a wrong item**: remove the line and also remove its `id`
  from `seen.json` so it can be re-evaluated; or leave the line and let
  the digest's grounding rules ignore it.
- **Re-run a digest**: delete the existing `digests/YYYY-Www.md` and
  run `npm run digest:weekly -- END_DATE=YYYY-MM-DD`.
