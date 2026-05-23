from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_evidence import rollback_drill_passed_from_file  # noqa: E402


def test_rollback_drill_evidence_rejects_missing_result_line(tmp_path) -> None:
    rollback = tmp_path / "rollback-drill.txt"
    rollback.write_text("operator=release\n", encoding="utf-8")

    with pytest.raises(ValueError, match="missing rollback drill result"):
        rollback_drill_passed_from_file(rollback)
