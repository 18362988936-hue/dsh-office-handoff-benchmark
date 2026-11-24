"""Offline scorer controls, deliberately edited, not runtime outcomes."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ENTRY = Path(__file__).resolve().parent / "benchmark" / "office.py"


class OfficeBenchmark(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name) / "agent"
        subprocess.run([sys.executable, ENTRY, "stage", self.work], check=True)
        self.assertEqual(list(self.work.iterdir()), [self.work / "input"])
        self.csv = self.work / "totals.csv"
        self.note = self.work / "handoff.md"
        self.csv.write_text("channel,total_cents\ndirect,1848\npartner,2725\n")
        self.write_note()

    def write_note(self, date="2026-11-22", file="orders-v2.csv"):
        h = hashlib.sha256((self.work / "input" / file).read_bytes()).hexdigest()
        self.note.write_text(f"as_of: {date}\nsource: input/{file}\nsource_sha256: {h}\n")

    def result(self, failed=()):
        p = subprocess.run([sys.executable, ENTRY, "score", self.work], capture_output=True, text=True)
        self.assertEqual(p.returncode, bool(failed), p.stderr)
        result = json.loads(p.stdout)
        self.assertEqual(result["accepted"], not failed)
        self.assertEqual({k for k, v in result["checks"].items() if not v}, set(failed))

    def test_correct_delivery(self):
        self.result()

    def test_missing_output(self):
        self.csv.unlink()
        self.result(("totals.csv_content",))

    def test_plausible_wrong_total(self):
        self.csv.write_text("channel,total_cents\ndirect,1848\npartner,2724\n")
        self.result(("totals.csv_content",))

    def test_stale_source_even_when_totals_are_correct(self):
        self.write_note(file="orders-v1.csv")
        self.result(("handoff.md_source", "handoff.md_source_sha256"))

    def test_original_date_drift_even_when_totals_are_correct(self):
        self.write_note(date="2026-11-23")
        self.result(("handoff.md_as_of",))

    def test_claimed_correct_provenance_with_modified_input(self):
        (self.work / "input/orders-v2.csv").write_text("modified\n")
        self.result(("source_bytes",))

    def test_changes_to_non_authoritative_input_are_also_rejected(self):
        (self.work / "input/orders-v1.csv").write_text("modified\n")
        self.result(("alternate_source_bytes",))

    def test_duplicate_channel_not_silently_overwritten(self):
        self.csv.write_text("channel,total_cents\ndirect,999\ndirect,1848\npartner,2725\n")
        self.result(("totals.csv_content",))
