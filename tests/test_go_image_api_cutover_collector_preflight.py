from __future__ import annotations

import os
import subprocess

import pytest


@pytest.mark.parametrize(
    ("overrides", "expected_code", "expected_stderr", "rollback_text"),
    [
        ({"WINDOW_HOURS": "23"}, 64, "WINDOW_HOURS must be at least 24\n", None),
        ({"WINDOW_HOURS": "daily"}, 64, "WINDOW_HOURS must be an integer\n", None),
        ({"RENDER_DURATION_P95_THRESHOLD_SECONDS": ""}, 64, "RENDER_DURATION_P95_THRESHOLD_SECONDS is required\n", None),
        ({"RENDER_DURATION_P95_THRESHOLD_SECONDS": "0"}, 64, "RENDER_DURATION_P95_THRESHOLD_SECONDS must be positive\n", None),
        ({"RENDER_DURATION_P95_THRESHOLD_SECONDS": "fast"}, 64, "RENDER_DURATION_P95_THRESHOLD_SECONDS must be positive\n", None),
        ({"VERIFY_LIMIT": "0"}, 64, "VERIFY_LIMIT must be a positive integer\n", None),
        ({"VERIFY_LIMIT": "many"}, 64, "VERIFY_LIMIT must be a positive integer\n", None),
        ({"DATABASE_URL": ""}, 64, "DATABASE_URL is required\n", None),
        ({"ROLLBACK_DRILL_EVIDENCE_FILE": ""}, 64, "ROLLBACK_DRILL_EVIDENCE_FILE is required\n", None),
        ({}, 69, "ROLLBACK_DRILL_EVIDENCE_FILE must point to a non-empty file\n", None),
        ({}, 69, "ROLLBACK_DRILL_EVIDENCE_FILE must point to a non-empty file\n", ""),
        ({}, 69, "ROLLBACK_DRILL_EVIDENCE_FILE contains placeholder marker\n", "TODO rollback_drill_passed=true\n"),
        ({}, 69, "ROLLBACK_DRILL_EVIDENCE_FILE contains placeholder marker\n", "synthetic_success rollback_drill_passed=true\n"),
        ({}, 69, "ROLLBACK_DRILL_EVIDENCE_FILE contains placeholder marker\n", "mock_pass rollback_drill_passed=true\n"),
        ({}, 69, "ROLLBACK_DRILL_EVIDENCE_FILE must include rollback_drill_passed=true\n", "operator=release\n"),
        ({}, 69, "ROLLBACK_DRILL_EVIDENCE_FILE reports rollback_drill_passed=false\n", "rollback_drill_passed=false\n"),
        (
            {},
            69,
            "ROLLBACK_DRILL_EVIDENCE_FILE contains multiple rollback_drill_passed results\n",
            "rollback_drill_passed=true\nrollback_drill_passed=false\n",
        ),
    ],
)
def test_collector_rejects_invalid_inputs_before_creating_evidence(
    tmp_path,
    overrides: dict[str, str],
    expected_code: int,
    expected_stderr: str,
    rollback_text: str | None,
) -> None:
    result, evidence_dir = run_collector(tmp_path, rollback_text=rollback_text, **overrides)

    assert result.returncode == expected_code
    assert result.stderr == expected_stderr
    assert not evidence_dir.exists()


def run_collector(tmp_path, *, rollback_text: str | None = None, **overrides: str):
    evidence_dir = tmp_path / "evidence"
    rollback_file = tmp_path / "rollback.txt"
    if rollback_text is not None:
        rollback_file.write_text(rollback_text, encoding="utf-8")
    env = os.environ | {
        "DATABASE_URL": "postgresql://unused",
        "EVIDENCE_DIR": str(evidence_dir),
        "RENDER_DURATION_P95_THRESHOLD_SECONDS": "180",
        "ROLLBACK_DRILL_EVIDENCE_FILE": str(rollback_file),
        "WINDOW_HOURS": "24",
        "VERIFY_LIMIT": "1000",
        **overrides,
    }
    result = subprocess.run(
        ["bash", "scripts/collect-go-image-api-cutover-evidence.sh"],
        cwd=os.getcwd(),
        env=env,
        text=True,
        capture_output=True,
        timeout=60,
    )
    return result, evidence_dir
