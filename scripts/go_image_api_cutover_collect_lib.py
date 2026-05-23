from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from go_image_api_cutover_check_lib import EXIT_GATE_FAILED, MIN_WINDOW_HOURS, REQUIRED_CHECK_NAMES
from go_image_api_cutover_check_lib import MAX_DIRECTION, MIN_DIRECTION, STRICT_MAX_DIRECTION
from go_image_api_cutover_decision import (
    NEXT_ACTION_KEEP_GATED,
    NEXT_ACTION_PROMOTE_READ_CREATE,
    NEXT_ACTION_PROMOTE_READ_KEEP_CREATE_GRAY,
    PHASE8_STATUS_BLOCKED,
    PHASE8_STATUS_COMPLETE,
    PHASE8_STATUS_PARTIAL,
    can_promote_read_default,
)
from go_image_api_cutover_manifest import (
    CutoverReportValidationError,
    REQUIRED_MANIFEST_ARTIFACT_NAMES,
    REQUIRED_MANIFEST_ARTIFACT_PATHS,
    validate_cutover_manifest,
    validate_manifest_artifacts,
)


REQUIRED_REPORT_KEYS = frozenset({"passed", "window_hours", "checks", "cutover_decision", "summary"})
CHECK_STATUSES = frozenset({"pass", "fail", "unknown"})
CHECK_EVIDENCE_KEYS = ("value", "threshold")
BOOLEAN_CHECK_NAMES = frozenset({"rollback_drill_passed"})
CHECK_DIRECTIONS = {
    "items_in_window": MIN_DIRECTION,
    "create_5xx_rate": STRICT_MAX_DIRECTION,
    "create_go_upstream_count": MIN_DIRECTION,
    "create_non_go_upstream_count": MAX_DIRECTION,
    "create_unknown_upstream_count": MAX_DIRECTION,
    "item_terminal_failure_rate": STRICT_MAX_DIRECTION,
    "provider_failure_rate": STRICT_MAX_DIRECTION,
    "invalid_queue_timestamp_count": MAX_DIRECTION,
    "queue_wait_p95_seconds": STRICT_MAX_DIRECTION,
    "invalid_render_timestamp_count": MAX_DIRECTION,
    "render_duration_p95_seconds": MAX_DIRECTION,
    "outbox_pending_oldest_age_seconds": STRICT_MAX_DIRECTION,
    "dead_letter_growth": MAX_DIRECTION,
    "worker_heartbeat_failed_count": MAX_DIRECTION,
    "asset_missing_count": MAX_DIRECTION,
    "asset_mismatched_count": MAX_DIRECTION,
}
REQUIRED_DECISION_KEYS = frozenset({
    "phase8_status",
    "go_image_api_read_default_allowed",
    "go_image_api_create_default_allowed",
    "next_action",
    "failed_checks",
    "unknown_checks",
})
EXPECTED_DECISIONS = {
    True: {
        "phase8_status": PHASE8_STATUS_COMPLETE,
        "go_image_api_read_default_allowed": True,
        "go_image_api_create_default_allowed": True,
        "next_action": NEXT_ACTION_PROMOTE_READ_CREATE,
        "failed_checks": [],
        "unknown_checks": [],
    },
    False: {
        "phase8_status": PHASE8_STATUS_BLOCKED,
        "go_image_api_read_default_allowed": False,
        "go_image_api_create_default_allowed": False,
        "next_action": NEXT_ACTION_KEEP_GATED,
    },
}
PARTIAL_READ_DECISION = {
    "phase8_status": PHASE8_STATUS_PARTIAL,
    "go_image_api_read_default_allowed": True,
    "go_image_api_create_default_allowed": False,
    "next_action": NEXT_ACTION_PROMOTE_READ_KEEP_CREATE_GRAY,
}
CHECKER_SUCCESS_EXIT_CODE = 0
CHECKER_ALLOWED_EXIT_CODES = frozenset({CHECKER_SUCCESS_EXIT_CODE, EXIT_GATE_FAILED})


def validate_cutover_report_file(path: Path) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise CutoverReportValidationError("empty cutover report")
    report = load_cutover_report(path)
    validate_cutover_report(report)


def load_cutover_report(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CutoverReportValidationError(str(exc)) from exc


def manifest_cutover_decision(path: Path, *, checker_exit_code: int | None = None) -> dict[str, Any]:
    report = load_cutover_report(path)
    validate_cutover_report(report)
    validate_checker_exit_code(checker_exit_code, passed=report["passed"])
    return dict(report["cutover_decision"])


def validate_cutover_report(report: Any) -> None:
    if not isinstance(report, dict):
        raise CutoverReportValidationError("report must be a JSON object")
    missing = sorted(REQUIRED_REPORT_KEYS - report.keys())
    if missing:
        raise CutoverReportValidationError(f"missing required report keys: {', '.join(missing)}")
    if type(report["passed"]) is not bool:
        raise CutoverReportValidationError("passed must be boolean")
    validate_window_hours(report["window_hours"])
    if not isinstance(report["checks"], list) or not report["checks"]:
        raise CutoverReportValidationError("empty checks")
    validate_checks(report["checks"])
    validate_summary(report["summary"], report["checks"])
    validate_cutover_decision(report["cutover_decision"], passed=report["passed"])
    validate_decision_check_lists(report["cutover_decision"], report["checks"])
    validate_passed_matches_checks(report["passed"], report["checks"])


def validate_window_hours(value: Any) -> None:
    if type(value) is not int:
        raise CutoverReportValidationError("window_hours must be an integer")
    if value < MIN_WINDOW_HOURS:
        raise CutoverReportValidationError(f"window_hours must be at least {MIN_WINDOW_HOURS}")


def validate_checker_exit_code(checker_exit_code: int | None, *, passed: bool) -> None:
    if checker_exit_code is None:
        return
    if checker_exit_code not in CHECKER_ALLOWED_EXIT_CODES:
        raise CutoverReportValidationError("unexpected checker exit code")
    checker_succeeded = checker_exit_code == CHECKER_SUCCESS_EXIT_CODE
    if checker_succeeded is not passed:
        raise CutoverReportValidationError("checker exit code contradicts report.passed")


def validate_summary(summary: Any, checks: list[Any]) -> None:
    if not isinstance(summary, dict):
        raise CutoverReportValidationError("summary must be a JSON object")
    items_in_window = summary.get("items_in_window")
    if type(items_in_window) is not int or items_in_window < 0:
        raise CutoverReportValidationError("summary.items_in_window must be an integer")
    if items_in_window != check_value(checks, "items_in_window"):
        raise CutoverReportValidationError("summary.items_in_window must match items_in_window check value")


def check_value(checks: list[Any], name: str) -> Any:
    for check in checks:
        if isinstance(check, dict) and check.get("name") == name:
            return check.get("value")
    return None


def validate_cutover_decision(decision: Any, *, passed: bool) -> None:
    if not isinstance(decision, dict):
        raise CutoverReportValidationError("cutover_decision must be a JSON object")
    missing = sorted(REQUIRED_DECISION_KEYS - decision.keys())
    if missing:
        raise CutoverReportValidationError(f"missing cutover_decision keys: {', '.join(missing)}")
    validate_check_name_list(decision["failed_checks"], "failed_checks")
    validate_check_name_list(decision["unknown_checks"], "unknown_checks")
    expected = expected_decision_values(decision, passed=passed)
    for key, expected_value in expected.items():
        actual_value = decision[key]
        if actual_value != expected_value or type(actual_value) is not type(expected_value):
            passed_text = str(passed).lower()
            raise CutoverReportValidationError(
                f"cutover_decision.{key} must be {expected_value!r} when passed={passed_text}"
            )
    if expected is PARTIAL_READ_DECISION and not can_promote_read_default(
        decision["failed_checks"],
        decision["unknown_checks"],
    ):
        raise CutoverReportValidationError("partial read-default decision has disallowed blocking checks")


def expected_decision_values(decision: dict[str, Any], *, passed: bool) -> dict[str, Any]:
    if passed:
        return EXPECTED_DECISIONS[True]
    if decision.get("phase8_status") == PHASE8_STATUS_PARTIAL:
        return PARTIAL_READ_DECISION
    return EXPECTED_DECISIONS[False]


def validate_check_name_list(value: Any, label: str) -> None:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise CutoverReportValidationError(f"{label} must be a list of strings")


def validate_checks(checks: list[Any]) -> None:
    seen: set[str] = set()
    check_names: list[str] = []
    for check in checks:
        if not isinstance(check, dict):
            raise CutoverReportValidationError("check must be a JSON object")
        if not isinstance(check.get("name"), str) or not check["name"]:
            raise CutoverReportValidationError("check.name must be a non-empty string")
        check_name = str(check["name"])
        check_names.append(check_name)
        if check_name in seen:
            raise CutoverReportValidationError(f"duplicate cutover check: {check_name}")
        seen.add(check_name)
        if check.get("status") not in CHECK_STATUSES:
            raise CutoverReportValidationError("check.status must be pass/fail/unknown")
        validate_check_evidence_fields(check)
    missing = [name for name in REQUIRED_CHECK_NAMES if name not in seen]
    if missing:
        raise CutoverReportValidationError(f"missing required cutover checks: {', '.join(missing)}")
    unexpected = [name for name in check_names if name not in REQUIRED_CHECK_NAMES]
    if unexpected:
        raise CutoverReportValidationError(f"unexpected cutover checks: {', '.join(unexpected)}")
    if check_names != list(REQUIRED_CHECK_NAMES):
        raise CutoverReportValidationError("cutover checks must match required order")


def validate_decision_check_lists(decision: dict[str, Any], checks: list[Any]) -> None:
    for status, key in (("fail", "failed_checks"), ("unknown", "unknown_checks")):
        expected_names = check_names_with_status(checks, status)
        if decision[key] != expected_names:
            raise CutoverReportValidationError(f"{key} must match checks with status {status}")


def validate_passed_matches_checks(passed: bool, checks: list[Any]) -> None:
    blocking_checks = check_names_with_status(checks, "fail") + check_names_with_status(checks, "unknown")
    if passed and blocking_checks:
        raise CutoverReportValidationError("passed reports must not include fail or unknown checks")
    if not passed and not blocking_checks:
        raise CutoverReportValidationError("failed reports must include fail or unknown checks")


def check_names_with_status(checks: list[Any], status: str) -> list[str]:
    return [str(check["name"]) for check in checks if isinstance(check, dict) and check.get("status") == status]


def validate_check_evidence_fields(check: dict[str, Any]) -> None:
    for key in CHECK_EVIDENCE_KEYS:
        if key not in check:
            raise CutoverReportValidationError(f"check.{key} is required")
        if not is_valid_evidence_value(check[key]):
            raise CutoverReportValidationError(f"check.{key} must be a number, boolean, or null")
        validate_check_evidence_type(check, key)
    validate_check_evidence_status(check)


def validate_check_evidence_status(check: dict[str, Any]) -> None:
    status = check["status"]
    if status in {"pass", "fail"}:
        for key in CHECK_EVIDENCE_KEYS:
            if check[key] is None:
                raise CutoverReportValidationError(f"check.{key} must not be null when status={status}")
        validate_check_status_matches_evidence(check)
    if status == "unknown" and check["value"] is not None and check["threshold"] is not None:
        raise CutoverReportValidationError("unknown check must have null value or threshold")


def validate_check_evidence_type(check: dict[str, Any], key: str) -> None:
    value = check[key]
    if value is None:
        return
    name = str(check["name"])
    if name in BOOLEAN_CHECK_NAMES:
        if type(value) is not bool:
            raise CutoverReportValidationError(f"check.{key} must be boolean for {name}")
        return
    if type(value) not in (int, float):
        raise CutoverReportValidationError(f"check.{key} must be numeric for {name}")
    if value < 0:
        raise CutoverReportValidationError(f"check.{key} must be non-negative for {name}")


def validate_check_status_matches_evidence(check: dict[str, Any]) -> None:
    name = str(check["name"])
    if name in BOOLEAN_CHECK_NAMES:
        passed = check["value"] is True and check["threshold"] is True
    elif name in CHECK_DIRECTIONS:
        passed = numeric_evidence_passes(check["value"], check["threshold"], CHECK_DIRECTIONS[name])
    else:
        return
    expected_status = "pass" if passed else "fail"
    if check["status"] != expected_status:
        raise CutoverReportValidationError(f"check.status contradicts value/threshold for {name}")


def numeric_evidence_passes(value: int | float, threshold: int | float, direction: str) -> bool:
    if direction == STRICT_MAX_DIRECTION:
        return value < threshold
    if direction == MAX_DIRECTION:
        return value <= threshold
    if direction == MIN_DIRECTION:
        return value >= threshold
    raise CutoverReportValidationError(f"unsupported check direction: {direction}")


def is_valid_evidence_value(value: Any) -> bool:
    if value is None or type(value) in (bool, int):
        return True
    return type(value) is float and math.isfinite(value)
