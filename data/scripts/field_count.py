#!/usr/bin/env python3
"""
field_count.py — Per-dimension field counts for the UC AI baseline.

Walks data/uc_ai_baseline.json and reports:
- Total field count
- Per-dimension count (across all entities)
- Per-entity count (for spotting sparsity)
- Coverage matrix: entities × dimensions, marking which buckets are populated

Used as a sanity check before/after enrichment passes. No side effects.
"""

import json
import sys
from pathlib import Path

BASELINE = Path(__file__).parent.parent / "uc_ai_baseline.json"

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


def main():
    data = json.loads(BASELINE.read_text())
    entities = data["entities"]
    version = data["metadata"]["version"]

    per_dim = {d: 0 for d in DIMENSIONS}
    per_entity = {}
    coverage = {}
    total = 0

    for eid, ent in entities.items():
        per_entity[eid] = 0
        coverage[eid] = {}
        for dim in DIMENSIONS:
            bucket = ent.get(dim) or {}
            n = len(bucket)
            per_dim[dim] += n
            per_entity[eid] += n
            coverage[eid][dim] = n
            total += n

    print(f"Baseline v{version}")
    print(f"Entities: {len(entities)}   Total fields: {total}")
    print()

    print("Per-dimension field counts:")
    for dim in DIMENSIONS:
        bar = "#" * (per_dim[dim] // 2)
        print(f"  {dim:<22} {per_dim[dim]:>4}  {bar}")

    print()
    print("Per-entity field counts:")
    for eid in sorted(per_entity, key=lambda k: per_entity[k], reverse=True):
        bar = "#" * (per_entity[eid] // 2)
        print(f"  {eid:<22} {per_entity[eid]:>4}  {bar}")

    print()
    print("Coverage matrix (n = field count; '-' = empty):")
    header = "                       " + " ".join(d[:4] for d in DIMENSIONS)
    print(header)
    for eid in entities:
        row = f"  {eid:<22}"
        for dim in DIMENSIONS:
            n = coverage[eid][dim]
            row += f" {n:>4}" if n else "    -"
        print(row)


if __name__ == "__main__":
    main()
