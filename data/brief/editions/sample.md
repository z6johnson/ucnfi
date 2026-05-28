---
{
  "edition_id": "sample",
  "week_ending": "2026-05-28",
  "status": "published",
  "reviewed_by": "SAMPLE",
  "reviewed_at": "2026-05-28T17:00:00Z",
  "generated_at": "2026-05-28T15:00:00Z",
  "generated_by_model": "hand-authored-sample",
  "inputs_manifest": {
    "external": { "from": "2026-05-21", "to": "2026-05-28", "n": 0 },
    "peer": { "from": "2026-05-21", "to": "2026-05-28", "n": 0 },
    "vendor": { "from": "2026-05-21", "to": "2026-05-28", "n": 0 },
    "committee_signal_dates": []
  },
  "items": {
    "item-1": {
      "priority": 1,
      "feed_sources": [
        {
          "kind": "external",
          "subkind": "ed_ocr",
          "url": "https://www.federalregister.gov/documents",
          "title": "Sample: ED interim guidance on AI use in financial aid processing",
          "published_at": "2026-05-22"
        }
      ],
      "baseline_anchors": [
        {
          "entity_id": "ucop_systemwide",
          "dimension": "infrastructure",
          "field": "has_enterprise_ai_platform",
          "claim_kind": "uc_silent"
        },
        {
          "entity_id": "ucop_systemwide",
          "dimension": "governance",
          "field": "has_ai_council",
          "claim_kind": "uc_has_position"
        }
      ],
      "peer_anchors": [
        {
          "peer_id": "umich",
          "dimension": "infrastructure",
          "field": "has_enterprise_ai_platform",
          "claim_kind": "peer_has_position"
        }
      ],
      "experts": []
    },
    "item-2": {
      "priority": 3,
      "feed_sources": [
        {
          "kind": "vendor",
          "subkind": "vendor_anthropic",
          "url": "https://www.anthropic.com/news",
          "title": "Sample: vendor announces new enterprise pricing tier",
          "published_at": "2026-05-25"
        }
      ],
      "baseline_anchors": [
        {
          "entity_id": "ucop_systemwide",
          "dimension": "policy",
          "field": "has_use_policy",
          "claim_kind": "uc_has_position"
        }
      ],
      "peer_anchors": [],
      "experts": []
    }
  }
}
---

## item-1 — Sample: federal guidance on AI in financial aid lands ahead of next cycle

### What happened
This is a hand-authored sample so the /brief page has something to render before the first real generation run. ED publishes an interim rule requiring disclosure of automated decision-making in aid determinations, effective for the next aid cycle. A real Brief item would link to the Federal Register notice here.

### Why it matters to UC
UC has a multi-layered governance model anchored by the UC AI Council, but the baseline shows no systemwide enterprise AI platform — each campus runs its own (TritonGPT, ZotGPT, ChatGPT Enterprise). A federal disclosure requirement that lands per-application would land per-campus, with no systemwide implementation owner; peer institutions like the University of Michigan run a single enterprise platform that would carry one disclosure path.

### For the committee
Decide whether to set a systemwide implementation owner for the disclosure path before the next aid cycle, or accept that compliance is a campus-by-campus build.

## item-2 — Sample: vendor pricing change reshapes enterprise economics

### What happened
A model vendor announces a new enterprise pricing tier that materially lowers the per-seat cost of a workforce deployment. A real Brief item would link to the vendor announcement here.

### Why it matters to UC
UC's Statement of Awareness on AI is the systemwide use policy framing how campuses think about model procurement. A material price drop changes the implicit affordability calculus the policy assumes; campuses currently mid-negotiation will need to know.

### For the committee
Flag to the Power of 10 use-case process so any campus negotiations get the revised vendor terms before signing.
