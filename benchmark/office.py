"""Stage the synthetic benchmark and score artifacts without reading agent claims."""
import argparse
import csv
import hashlib
import json
import shutil
import sys
from pathlib import Path

BENCHMARK = Path(__file__).resolve().parent
EXPECTED = BENCHMARK / "oracle" / "expected.json"
TOTALS_HEADER = ["channel", "total_cents"]
META_KEYS = ("as_of", "source", "source_sha256")


def stage(workspace):
    oracle = BENCHMARK / "oracle"
    workspace = workspace.resolve()
    if workspace.is_relative_to(BENCHMARK) or oracle.is_relative_to(workspace):
        raise ValueError("stage to a new directory outside the benchmark")
    workspace.mkdir(parents=True, exist_ok=False)
    shutil.copytree(BENCHMARK / "input", workspace / "input")


def artifact(workspace, name):
    path = (workspace / name).resolve()
    if not path.is_relative_to(workspace) or not path.is_file():
        return None
    return path


def score(workspace, expected):
    workspace = workspace.resolve()
    checks = {}

    def check_file(name, condition):
        try:
            return bool((p := artifact(workspace, name)) and condition(p))
        except (OSError, ValueError, csv.Error):
            return False

    def check_totals(path):
        with path.open(encoding="utf-8", newline="") as f:
            reader = csv.reader(f, strict=True)
            if next(reader, None) != TOTALS_HEADER:
                return False
            actual = {}
            for row in reader:
                if len(row) != 2 or row[0] in actual or not row[1].isascii() or not row[1].isdecimal():
                    return False
                actual[row[0]] = int(row[1])
            return actual == expected["totals"]

    checks["totals.csv_content"] = check_file("totals.csv", check_totals)
    lines = None

    def read_note(path):
        nonlocal lines
        lines = path.read_text(encoding="utf-8").splitlines()
        return len(lines) == len(META_KEYS)

    checks["handoff.md_format"] = check_file("handoff.md", read_note)
    for i, key in enumerate(META_KEYS):
        checks[f"handoff.md_{key}"] = checks["handoff.md_format"] and lines[i] == f"{key}: {expected[key]}"
    checks["source_bytes"] = check_file(
        expected["source"], lambda p: hashlib.sha256(p.read_bytes()).hexdigest() == expected["source_sha256"]
    )
    checks["alternate_source_bytes"] = check_file(
        "input/orders-v1.csv", lambda p: hashlib.sha256(p.read_bytes()).hexdigest() == expected["alternate_source_sha256"]
    )
    return {"accepted": all(checks.values()), "checks": checks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("stage", "score"))
    parser.add_argument("workspace", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "stage":
            stage(args.workspace)
            return 0
        result = score(args.workspace, json.loads(EXPECTED.read_text(encoding="utf-8")))
        print(json.dumps(result, indent=2))
        return 0 if result["accepted"] else 1
    except (OSError, ValueError, KeyError) as exc:
        print(f"benchmark error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
