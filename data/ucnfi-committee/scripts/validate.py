#!/usr/bin/env python3
"""Validate all member records against the schema.

Usage:
    python scripts/validate.py
    python scripts/validate.py records/khosla-p.json   # validate one
"""
import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    print("Install jsonschema first: pip install jsonschema")
    sys.exit(1)

ROOT = Path(__file__).parent.parent
SCHEMA_PATH = ROOT / "schema" / "member.schema.json"
RECORDS_DIR = ROOT / "records"


def main():
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)

    if len(sys.argv) > 1:
        paths = [Path(p) for p in sys.argv[1:]]
    else:
        paths = sorted(RECORDS_DIR.glob("*.json"))

    errors = 0
    for path in paths:
        with open(path) as f:
            record = json.load(f)
        try:
            jsonschema.validate(record, schema)
            print(f"OK   {path.name}")
        except jsonschema.ValidationError as e:
            errors += 1
            print(f"FAIL {path.name}")
            print(f"  message: {e.message}")
            print(f"  path:    {list(e.path)}")

    print(f"\n{len(paths)} records, {errors} failures")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
