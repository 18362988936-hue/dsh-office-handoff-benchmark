from copy import deepcopy
import hashlib
from pathlib import Path
import tempfile
import unittest
from check import audit, digest

class TestAcceptance(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "report.md").write_bytes(b"Delivery")
        (self.root / "source.csv").write_text("id,value\n1,2\n")
        self.contract = {"task_id":"demo", "required_artifacts":["report.md"],
                         "required_evidence":{"totals":["source.csv"]},
                         "required_constraints":{"locale":"zh-CN", "max_rows":10}}
        self.delivery = {"status":"completed", "task_id":"demo", "contract_sha256":digest(self.contract),
                         "artifacts":{"report.md": hashlib.sha256(b"Delivery").hexdigest()},
                         "evidence":{"totals":["source.csv"]},
                         "constraints":{"locale":"zh-CN", "max_rows":10}}

    def result(self):
        return audit(self.root, self.contract, self.delivery)["accepted"]

    def test_complete(self):
        self.assertTrue(self.result())

    def test_claimed_done_missing_file(self):
        (self.root / "report.md").unlink()
        self.assertFalse(self.result())

    def test_changed_artifact(self):
        (self.root / "report.md").write_bytes(b"Changed")
        self.assertFalse(self.result())

    def test_resumed_contract_drift(self):
        resumed = deepcopy(self.contract)
        del resumed["required_constraints"]["max_rows"]
        self.delivery["contract_sha256"] = digest(resumed)
        del self.delivery["constraints"]["max_rows"]
        self.assertFalse(self.result())

    def test_replaced_evidence(self):
        self.delivery["evidence"]["totals"] = ["report.md"]
        self.assertFalse(self.result())
