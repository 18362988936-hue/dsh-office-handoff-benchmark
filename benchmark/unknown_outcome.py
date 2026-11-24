"""Offline calibration: the same tagged recovery receipt does not prove delivery."""
import argparse
import json
import tempfile
from pathlib import Path

import office

OPT = Path("apps/cli/tests/profiles/headless/tests/expected/semantic-checkpoint/session.expected.jsonl")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pinned_upstream", type=Path)
    args = parser.parse_args()
    expected = json.loads(office.EXPECTED.read_text(encoding="utf-8"))
    events = [json.loads(line) for line in (args.pinned_upstream / OPT).read_text(encoding="utf-8").splitlines() if line.strip()]
    matches = [event for event in events
               if event.get("type") == "tool/result"
               and event["data"].get("error", {}).get("code") == "TOOL_OUTCOME_UNKNOWN"]
    if len(matches) != 1:
        raise SystemExit("expected one unknown-outcome receipt in the pinned snapshot")
    data = matches[0]["data"]
    receipt = {"code": data["error"]["code"], "call_id": data["message"]["toolCallId"]}
    with tempfile.TemporaryDirectory(prefix="dsh-receipt-calibration-") as root:
        for seed in (True, False):
            work = Path(root) / ("preseeded" if seed else "absent")
            office.stage(work)
            if seed:
                (work / "totals.csv").write_text("channel,total_cents\ndirect,1848\npartner,2725\n", encoding="utf-8")
                (work / "handoff.md").write_text(
                    "".join(f"{k}: {expected[k]}\n" for k in office.META_KEYS), encoding="utf-8")
            before = {p.relative_to(work): p.read_bytes() for p in work.rglob("*") if p.is_file()}
            scored = office.score(work, expected)
            after = {p.relative_to(work): p.read_bytes() for p in work.rglob("*") if p.is_file()}
            assert before == after
            assert scored["accepted"] is seed
            print(json.dumps({"mode": "offline-preseeded-calibration", "receipt": receipt,
                              "outputs_preseeded": seed, "scorer_changed_files": before != after, **scored}))


if __name__ == "__main__":
    main()
