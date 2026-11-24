"""Offline acceptance audit for a task contract and a final delivery manifest."""
import hashlib
import json
import sys
from pathlib import Path

def audit(root, contract, delivery):
    checks = []
    def add(name, ok):
        checks.append({"check": name, "pass": bool(ok)})
    def local_file(rel):
        p = (root / rel).resolve()
        return p if not Path(rel).is_absolute() and p.is_relative_to(root.resolve()) and p.is_file() else None
    files = delivery.get("artifacts", {})
    add("task_id", delivery.get("task_id") == contract["task_id"])
    add("contract_digest", delivery.get("contract_sha256") == digest(contract))
    for rel in contract["required_artifacts"]:
        p = local_file(rel)
        add(f"artifact:{rel}", p and p.stat().st_size and hashlib.sha256(p.read_bytes()).hexdigest() == files.get(rel))
    for claim, refs in contract["required_evidence"].items():
        actual = delivery.get("evidence", {}).get(claim, [])
        add(f"evidence:{claim}", set(refs) <= set(actual) and all(local_file(ref) for ref in actual))
    for name, expected in contract["required_constraints"].items():
        actual = delivery.get("constraints", {}).get(name)
        add(f"constraint:{name}", type(actual) is type(expected) and actual == expected)
    return {"accepted": all(c["pass"] for c in checks), "checks": checks}

def digest(contract):
    return hashlib.sha256(json.dumps(contract, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()

if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: python3 check.py ROOT CONTRACT_JSON DELIVERY_JSON")
    try:
        result = audit(Path(sys.argv[1]), *[json.loads(Path(p).read_text()) for p in sys.argv[2:]])
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        print(json.dumps({"accepted": False, "input_error": type(e).__name__}))
        sys.exit(2)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["accepted"] else 1)
