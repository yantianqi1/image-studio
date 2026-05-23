from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_collect_lib import (  # noqa: E402
    CutoverReportValidationError,
    REQUIRED_CHECK_NAMES,
    REQUIRED_MANIFEST_ARTIFACT_NAMES,
    REQUIRED_MANIFEST_ARTIFACT_PATHS,
    manifest_cutover_decision,
    validate_manifest_artifacts,
    validate_cutover_report,
)
from go_image_api_cutover_check_lib import MIN_WINDOW_HOURS  # noqa: E402


def test_report_validation_rejects_missing_window_hours() -> None:
    report = valid_report()
    report.pop("window_hours")

    with pytest.raises(CutoverReportValidationError, match="missing required report keys: window_hours"):
        validate_cutover_report(report)


def test_report_validation_rejects_short_window_hours() -> None:
    report = valid_report()
    report["window_hours"] = MIN_WINDOW_HOURS - 1

    with pytest.raises(CutoverReportValidationError, match="window_hours must be at least 24"):
        validate_cutover_report(report)


@pytest.mark.parametrize("window_hours", ["24", True])
def test_report_validation_rejects_non_integer_window_hours(window_hours: object) -> None:
    report = valid_report()
    report["window_hours"] = window_hours

    with pytest.raises(CutoverReportValidationError, match="window_hours must be an integer"):
        validate_cutover_report(report)


def test_report_validation_rejects_missing_summary() -> None:
    report = valid_report()
    report.pop("summary")

    with pytest.raises(CutoverReportValidationError, match="missing required report keys: summary"):
        validate_cutover_report(report)


def test_report_validation_rejects_missing_summary_items_in_window() -> None:
    report = valid_report()
    report["summary"] = {}

    with pytest.raises(CutoverReportValidationError, match="summary.items_in_window must be an integer"):
        validate_cutover_report(report)


def test_report_validation_rejects_summary_items_mismatch() -> None:
    report = valid_report()
    report["summary"] = {"items_in_window": 2}

    with pytest.raises(CutoverReportValidationError, match="summary.items_in_window must match items_in_window check value"):
        validate_cutover_report(report)


def test_report_validation_rejects_passed_check_without_evidence_values() -> None:
    report = valid_report()
    report["checks"][0].pop("value")

    with pytest.raises(CutoverReportValidationError, match="check.value is required"):
        validate_cutover_report(report)


def test_report_validation_rejects_placeholder_check_values() -> None:
    report = valid_report()
    report["checks"][0]["value"] = "TODO"

    with pytest.raises(CutoverReportValidationError, match="check.value must be a number, boolean, or null"):
        validate_cutover_report(report)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_report_validation_rejects_non_finite_check_values(value: float) -> None:
    report = valid_report()
    report["checks"][0]["value"] = value

    with pytest.raises(CutoverReportValidationError, match="check.value must be a number, boolean, or null"):
        validate_cutover_report(report)


def test_report_validation_rejects_passed_check_with_null_value() -> None:
    report = valid_report()
    report["checks"][0]["value"] = None

    with pytest.raises(CutoverReportValidationError, match="check.value must not be null when status=pass"):
        validate_cutover_report(report)


def test_report_validation_rejects_unknown_check_with_complete_evidence() -> None:
    report = valid_report()
    report["passed"] = False
    report["checks"][0]["status"] = "unknown"
    report["cutover_decision"] = blocked_decision(unknown_checks=[report["checks"][0]["name"]])

    with pytest.raises(CutoverReportValidationError, match="unknown check must have null value or threshold"):
        validate_cutover_report(report)


def test_report_validation_rejects_boolean_value_for_numeric_gate() -> None:
    report = valid_report()
    report["checks"][0]["value"] = True

    with pytest.raises(CutoverReportValidationError, match="check.value must be numeric for items_in_window"):
        validate_cutover_report(report)


def test_report_validation_rejects_numeric_value_for_boolean_gate() -> None:
    report = valid_report()
    report["checks"][-1]["value"] = 1

    with pytest.raises(CutoverReportValidationError, match="check.value must be boolean for rollback_drill_passed"):
        validate_cutover_report(report)


def test_report_validation_rejects_passed_check_with_failing_numeric_evidence() -> None:
    report = valid_report()
    report["checks"][1]["value"] = 1
    report["checks"][1]["threshold"] = 0.005

    with pytest.raises(CutoverReportValidationError, match="check.status contradicts value/threshold for create_5xx_rate"):
        validate_cutover_report(report)


def test_report_validation_rejects_failed_check_with_passing_numeric_evidence() -> None:
    report = valid_report()
    report["passed"] = False
    report["checks"][1]["status"] = "fail"
    report["cutover_decision"] = blocked_decision(failed_checks=["create_5xx_rate"])

    with pytest.raises(CutoverReportValidationError, match="check.status contradicts value/threshold for create_5xx_rate"):
        validate_cutover_report(report)


def test_report_validation_rejects_negative_numeric_evidence() -> None:
    report = valid_report()
    report["checks"][1]["value"] = -0.1

    with pytest.raises(CutoverReportValidationError, match="check.value must be non-negative for create_5xx_rate"):
        validate_cutover_report(report)


def test_report_validation_rejects_passed_boolean_check_with_false_value() -> None:
    report = valid_report()
    report["checks"][-1]["value"] = False

    with pytest.raises(CutoverReportValidationError, match="check.status contradicts value/threshold for rollback_drill_passed"):
        validate_cutover_report(report)


def test_manifest_decision_rejects_failed_report_with_zero_checker_exit(tmp_path) -> None:
    report = failed_report()
    report_path = tmp_path / "report.json"
    report_path.write_text(__import__("json").dumps(report), encoding="utf-8")

    with pytest.raises(CutoverReportValidationError, match="checker exit code contradicts report.passed"):
        manifest_cutover_decision(report_path, checker_exit_code=0)


def test_manifest_decision_rejects_passed_report_with_nonzero_checker_exit(tmp_path) -> None:
    report_path = tmp_path / "report.json"
    report_path.write_text(__import__("json").dumps(valid_report()), encoding="utf-8")

    with pytest.raises(CutoverReportValidationError, match="checker exit code contradicts report.passed"):
        manifest_cutover_decision(report_path, checker_exit_code=2)


def test_manifest_decision_rejects_unexpected_checker_exit_code(tmp_path) -> None:
    report = failed_report()
    report_path = tmp_path / "report.json"
    report_path.write_text(__import__("json").dumps(report), encoding="utf-8")

    with pytest.raises(CutoverReportValidationError, match="unexpected checker exit code"):
        manifest_cutover_decision(report_path, checker_exit_code=69)


def test_manifest_artifacts_reject_zero_byte_evidence() -> None:
    artifacts = valid_manifest_artifacts()
    artifacts[0]["bytes"] = 0

    with pytest.raises(CutoverReportValidationError, match="manifest artifact must be non-empty"):
        validate_manifest_artifacts(artifacts)


def test_manifest_artifacts_reject_missing_required_artifact() -> None:
    artifacts = [artifact for artifact in valid_manifest_artifacts() if artifact["name"] != "nginx_access_log"]

    with pytest.raises(CutoverReportValidationError, match="missing manifest artifacts: nginx_access_log"):
        validate_manifest_artifacts(artifacts)


def test_manifest_artifacts_reject_duplicate_artifact_names() -> None:
    artifacts = valid_manifest_artifacts()
    artifacts.append(dict(artifacts[0]))

    with pytest.raises(CutoverReportValidationError, match="duplicate manifest artifact: preflight"):
        validate_manifest_artifacts(artifacts)


def test_manifest_artifacts_reject_unexpected_artifact_names() -> None:
    artifacts = valid_manifest_artifacts()
    artifacts[-1]["name"] = "synthetic_success"

    with pytest.raises(CutoverReportValidationError, match="unexpected manifest artifacts: synthetic_success"):
        validate_manifest_artifacts(artifacts)


def test_manifest_artifacts_reject_non_hex_sha256() -> None:
    artifacts = valid_manifest_artifacts()
    artifacts[0]["sha256"] = "g" * 64

    with pytest.raises(CutoverReportValidationError, match="manifest artifact.sha256 must be a 64-character hex string"):
        validate_manifest_artifacts(artifacts)


def test_manifest_artifacts_reject_path_drift() -> None:
    artifacts = valid_manifest_artifacts()
    artifacts[0]["path"] = "renamed-preflight.txt"

    with pytest.raises(CutoverReportValidationError, match="manifest artifact.path must match expected file"):
        validate_manifest_artifacts(artifacts)


def valid_report() -> dict[str, object]:
    return {
        "passed": True,
        "window_hours": MIN_WINDOW_HOURS,
        "summary": {"items_in_window": 1},
        "checks": [
            {
                "name": name,
                "status": "pass",
                "value": valid_check_value(name),
                "threshold": True if name == "rollback_drill_passed" else 1,
            }
            for name in REQUIRED_CHECK_NAMES
        ],
        "cutover_decision": {
            "phase8_status": "complete",
            "go_image_api_read_default_allowed": True,
            "go_image_api_create_default_allowed": True,
            "next_action": "promote_go_image_api_read_create",
            "failed_checks": [],
            "unknown_checks": [],
        },
    }


def valid_check_value(name: str) -> object:
    if name == "rollback_drill_passed":
        return True
    if name in {"items_in_window", "create_go_upstream_count"}:
        return 1
    return 0


def failed_report() -> dict[str, object]:
    report = valid_report()
    report["passed"] = False
    report["summary"] = {"items_in_window": 0}
    report["checks"][0]["status"] = "fail"
    report["checks"][0]["value"] = 0
    report["checks"][0]["threshold"] = 1
    report["cutover_decision"] = blocked_decision(failed_checks=["items_in_window"])
    return report


def blocked_decision(*, failed_checks: list[str] | None = None, unknown_checks: list[str] | None = None) -> dict[str, object]:
    return {
        "phase8_status": "blocked",
        "go_image_api_read_default_allowed": False,
        "go_image_api_create_default_allowed": False,
        "next_action": "keep_go_image_api_gated",
        "failed_checks": failed_checks or [],
        "unknown_checks": unknown_checks or [],
    }


def valid_manifest_artifacts() -> list[dict[str, object]]:
    return [
        {"name": name, "path": REQUIRED_MANIFEST_ARTIFACT_PATHS[name], "bytes": 1, "sha256": "a" * 64}
        for name in REQUIRED_MANIFEST_ARTIFACT_NAMES
    ]
