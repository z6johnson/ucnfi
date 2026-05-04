#!/usr/bin/env python3
"""
compute_derived.py — Pure function: baseline -> derived analytics.

Reads data/uc_ai_baseline.json and writes data/uc_ai_derived.json.
Idempotent and deterministic. The baseline remains the source of truth;
derived data is regenerated on every baseline bump.

Three derived signals:

1. **Maturity score** — per (entity, dimension), integer 0-4.
   1 point each for:
     (a) any field present in the dimension
     (b) at least one field with value=true and a non-null source_url
     (c) a named leader or council in governance/leadership (heuristic on field names)
     (d) at least one dated artifact reference (years 2020-2026 in notes)

2. **RAI Principle concordance** — for each entity, status of each of the
   8 UC RAI Principles. Status: "verbatim" (direct cite), "adapted" (paraphrased
   keywords), or "absent". Heuristic match against principle keywords across all
   field notes for the entity.

3. **Policy adoption timeline** — extracted dated events from notes text.
   Regex over verbs ("adopted", "launched", "established", "formed", "effective",
   "appointed", "released") followed by a month-year or year. Sorted ascending.

Usage:
    python data/compute_derived.py
"""

import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
BASELINE = ROOT / "uc_ai_baseline.json"
DERIVED = ROOT / "uc_ai_derived.json"

DIMENSIONS = [
    "governance",
    "policy",
    "academic_integrity",
    "infrastructure",
    "leadership",
    "health_ai",
    "research",
    "training",
    "engagement",
    "security",
]

# UC Responsible AI Principles (from ucop-02, adopted Oct 6, 2021).
# Each entry: principle_id, name, keyword_groups. A principle is "verbatim" if
# the principle name appears as a phrase in the entity's notes; "adapted" if at
# least two keyword groups match; otherwise "absent".
RAI_PRINCIPLES = [
    {
        "id": "appropriateness",
        "name": "Appropriateness",
        "keyword_groups": [
            ["appropriate", "appropriateness"],
            ["benefit", "risk", "evaluate"],
        ],
    },
    {
        "id": "transparency",
        "name": "Transparency",
        "keyword_groups": [
            ["transparency", "transparent"],
            ["explain", "explainability", "explainable"],
        ],
    },
    {
        "id": "accuracy_reliability_safety",
        "name": "Accuracy, Reliability, Safety",
        "keyword_groups": [
            ["accuracy", "accurate"],
            ["reliable", "reliability"],
            ["safety", "safe"],
        ],
    },
    {
        "id": "fairness_nondiscrimination",
        "name": "Fairness and Non-Discrimination",
        "keyword_groups": [
            ["fairness", "fair"],
            ["bias", "discrimination", "non-discrimination", "nondiscrimination"],
        ],
    },
    {
        "id": "privacy_security",
        "name": "Privacy and Security",
        "keyword_groups": [
            ["privacy"],
            ["security", "secure"],
        ],
    },
    {
        "id": "human_values",
        "name": "Human Values",
        "keyword_groups": [
            ["human values", "human agency"],
            ["dignity", "civil rights", "human rights"],
        ],
    },
    {
        "id": "shared_benefit",
        "name": "Shared Benefit and Prosperity",
        "keyword_groups": [
            ["shared benefit", "equitable benefit"],
            ["inclusive", "prosperity"],
        ],
    },
    {
        "id": "accountability",
        "name": "Accountability",
        "keyword_groups": [
            ["accountability", "accountable"],
            ["oversight", "responsibility"],
        ],
    },
]

# Maturity heuristic helpers
LEADER_FIELD_HINTS = (
    "council",
    "committee",
    "leader",
    "officer",
    "chair",
    "chief",
    "director",
    "task_force",
    "working_group",
    "workgroup",
)


def has_leader_or_council(entity):
    for dim in ("governance", "leadership"):
        bucket = entity.get(dim) or {}
        for fname, rec in bucket.items():
            if rec.get("value") is False:
                continue
            if any(hint in fname for hint in LEADER_FIELD_HINTS):
                return True
    return False


YEAR_PATTERN = re.compile(r"\b(20[2-3]\d)\b")


def has_dated_artifact(bucket):
    for rec in bucket.values():
        notes = rec.get("notes") or ""
        url = rec.get("source_url") or ""
        if YEAR_PATTERN.search(notes) or YEAR_PATTERN.search(url):
            return True
    return False


def maturity_score(entity, dimension):
    bucket = entity.get(dimension) or {}
    if not bucket:
        return {"score": 0, "basis": []}

    score = 0
    basis = []

    score += 1
    basis.append("dimension_populated")

    has_true = any(
        rec.get("value") is True and rec.get("source_url")
        for rec in bucket.values()
    )
    if has_true:
        score += 1
        basis.append("evidenced_true_with_source")

    if dimension in ("governance", "leadership") and has_leader_or_council(entity):
        score += 1
        basis.append("named_leader_or_council")
    elif dimension not in ("governance", "leadership"):
        # For non-governance dimensions, give the structural point if there's a
        # named role anywhere in the entity (signals organizational ownership).
        if has_leader_or_council(entity):
            score += 1
            basis.append("named_leader_or_council")

    if has_dated_artifact(bucket):
        score += 1
        basis.append("dated_artifact")

    return {"score": score, "basis": basis}


def collect_entity_text(entity):
    parts = []
    for dim in DIMENSIONS:
        bucket = entity.get(dim) or {}
        for fname, rec in bucket.items():
            notes = rec.get("notes") or ""
            value = rec.get("value")
            parts.append(fname)
            if isinstance(value, str):
                parts.append(value)
            parts.append(notes)
    return " ".join(parts).lower()


def rai_concordance(entity):
    text = collect_entity_text(entity)
    out = []
    for p in RAI_PRINCIPLES:
        name_lower = p["name"].lower()
        status = "absent"
        evidence = None
        if name_lower in text:
            status = "verbatim"
            evidence = p["name"]
        else:
            matched_groups = 0
            matched_terms = []
            for group in p["keyword_groups"]:
                if any(term.lower() in text for term in group):
                    matched_groups += 1
                    matched_terms.append(group[0])
            if matched_groups >= 2 or (matched_groups >= 1 and len(p["keyword_groups"]) == 1):
                status = "adapted"
                evidence = ", ".join(matched_terms)
        out.append({
            "principle_id": p["id"],
            "principle_name": p["name"],
            "status": status,
            "evidence": evidence,
        })
    return out


# Timeline extraction
MONTHS = (
    "january|february|march|april|may|june|july|august|"
    "september|october|november|december|"
    "jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec"
)
EVENT_VERBS = (
    "adopted|launched|established|formed|effective|appointed|released|published|"
    "convened|created|signed|opened|delivered|inaugurated|named"
)
TIMELINE_PATTERN = re.compile(
    rf"\b({EVENT_VERBS})\b[^.]*?\b(?:in\s+)?(?:({MONTHS})\s+)?(20[2-3]\d)\b",
    re.IGNORECASE,
)
ISO_DATE_PATTERN = re.compile(r"\b(20[2-3]\d)-(\d{2})-(\d{2})\b")
MONTH_ABBR = {
    "jan": "01", "january": "01",
    "feb": "02", "february": "02",
    "mar": "03", "march": "03",
    "apr": "04", "april": "04",
    "may": "05",
    "jun": "06", "june": "06",
    "jul": "07", "july": "07",
    "aug": "08", "august": "08",
    "sep": "09", "sept": "09", "september": "09",
    "oct": "10", "october": "10",
    "nov": "11", "november": "11",
    "dec": "12", "december": "12",
}


def extract_timeline(entity_id, entity):
    rows = []
    seen = set()
    for dim in DIMENSIONS:
        bucket = entity.get(dim) or {}
        for fname, rec in bucket.items():
            notes = rec.get("notes") or ""
            source_id = rec.get("source_id")
            for m in TIMELINE_PATTERN.finditer(notes):
                verb = m.group(1).lower()
                month = (m.group(2) or "").lower()
                year = m.group(3)
                month_num = MONTH_ABBR.get(month, "01") if month else "01"
                date_str = f"{year}-{month_num}"
                snippet = notes[max(0, m.start() - 20): m.end() + 60].strip()
                key = (date_str, fname, snippet[:80])
                if key in seen:
                    continue
                seen.add(key)
                rows.append({
                    "entity_id": entity_id,
                    "dimension": dim,
                    "field": fname,
                    "verb": verb,
                    "date": date_str,
                    "source_id": source_id,
                    "snippet": snippet[:200],
                })
            for m in ISO_DATE_PATTERN.finditer(notes):
                date_str = f"{m.group(1)}-{m.group(2)}"
                snippet = notes[max(0, m.start() - 20): m.end() + 60].strip()
                key = (date_str, fname, snippet[:80])
                if key in seen:
                    continue
                seen.add(key)
                rows.append({
                    "entity_id": entity_id,
                    "dimension": dim,
                    "field": fname,
                    "verb": "dated",
                    "date": date_str,
                    "source_id": source_id,
                    "snippet": snippet[:200],
                })
    return rows


def main():
    baseline = json.loads(BASELINE.read_text())
    entities = baseline["entities"]
    baseline_version = baseline["metadata"]["version"]

    maturity = []
    concordance = []
    timeline = []

    for eid, ent in entities.items():
        for dim in DIMENSIONS:
            m = maturity_score(ent, dim)
            maturity.append({
                "entity_id": eid,
                "dimension": dim,
                "score": m["score"],
                "basis": m["basis"],
            })
        for row in rai_concordance(ent):
            concordance.append({"entity_id": eid, **row})
        timeline.extend(extract_timeline(eid, ent))

    timeline.sort(key=lambda r: (r["date"], r["entity_id"], r["field"]))

    derived = {
        "metadata": {
            "computed_at": datetime.date.today().isoformat(),
            "baseline_version": baseline_version,
            "derived_version": "0.1.0",
            "notes": (
                "Computed from data/uc_ai_baseline.json by data/compute_derived.py. "
                "Three signals: maturity (entity x dimension, 0-4), RAI principle "
                "concordance (verbatim|adapted|absent across the 8 UC RAI Principles), "
                "and policy adoption timeline (regex extraction over notes text)."
            ),
        },
        "maturity": maturity,
        "rai_concordance": concordance,
        "timeline": timeline,
    }

    DERIVED.write_text(json.dumps(derived, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {DERIVED}")
    print(f"  maturity rows:        {len(maturity)}")
    print(f"  rai_concordance rows: {len(concordance)}")
    print(f"  timeline rows:        {len(timeline)}")


if __name__ == "__main__":
    main()
