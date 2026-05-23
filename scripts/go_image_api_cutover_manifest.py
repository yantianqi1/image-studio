from __future__ import annotations

from datetime import datetime
import math
from typing import Any

from go_image_api_cutover_check_lib import EXIT_GATE_FAILED, MIN_WINDOW_HOURS, REQUIRED_CHECK_NAMES
from go_image_api_cutover_decision import (
    NEXT_ACTION_KEEP_GATED,
    NEXT_ACTION_PROMOTE_READ_CREATE,
    NEXT_ACTION_PROMOTE_READ_KEEP_CREATE_GRAY,
    PHASE8_STATUS_BLOCKED,
    PHASE8_STATUS_COMPLETE,
    PHASE8_STATUS_PARTIAL,
    can_promote_read_default,
)

CHECKER_SUCCESS_EXIT_CODE = 0
CHECKER_ALLOWED_EXIT_CODES = frozenset({CHECKER_SUCCESS_EXIT_CODE, EXIT_GATE_FAILED})
REQUIRED_MANIFEST_KEYS = frozenset({
    "generated_at_utc",
    "window_hours",
    "verify_limit",
    "render_duration_p95_threshold_seconds",
    "checker_exit_code",
    "cutover_decision",
    "artifacts",
})
REQUIRED_DECISION_KEYS = frozenset({
    "phase8_status",
    "go_image_api_read_default_allowed",
    "go_image_api_create_default_allowed",
    "next_action",
    "failed_checks",
    "unknown_checks",
})
SUCCESS_DECISION_VALUES = {
    "phase8_status": PHASE8_STATUS_COMPLETE,
    "go_image_api_read_default_allowed": True,
    "go_image_api_create_default_allowed": True,
    "next_action": NEXT_ACTION_PROMOTE_READ_CREATE,
    "failed_checks": [],
    "unknown_checks": [],
}
GATE_FAILED_DECISION_VALUES = {
    "phase8_status": PHASE8_STATUS_BLOCKED,
    "go_image_api_read_default_allowed": False,
    "go_image_api_create_default_allowed": False,
    "next_action": NEXT_ACTION_KEEP_GATED,
}
PARTIAL_READ_DECISION_VALUES = {
    "phase8_status": PHASE8_STATUS_PARTIAL,
    "go_image_api_read_default_allowed": True,
    "go_image_api_create_default_allowed": False,
    "next_action": NEXT_ACTION_PROMOTE_READ_KEEP_CREATE_GRAY,
}
REQUIRED_MANIFEST_ARTIFACT_PATHS = {
    "preflight": "preflight.txt",
    "raw_nginx_access_log": "nginx-access.raw.log",
    "nginx_access_log": "nginx-access.log",
    "worker_metrics": "worker-go.metrics",
    "asset_verify": "assetctl-verify-assets.out",
    "rollback_drill": "rollback-drill.txt",
    "cutover_report": "go-image-api-cutover-report.json",
}
REQUIRED_MANIFEST_ARTIFACT_NAMES = tuple(REQUIRED_MANIFEST_ARTIFACT_PATHS)
SHA256_HEX_LENGTH = 64


class CutoverManifestValidationError(ValueError):
    pass


CutoverReportValidationError = CutoverManifestValidationError


def validate_cutover_manifest(manifest: Any) -> None:
    if not isinstance(manifest, dict):
        raise CutoverManifestValidationError("manifest must be a JSON object")
    missing = sorted(REQUIRED_MANIFEST_KEYS - manifest.keys())
    if missing:
        raise CutoverManifestValidationError(f"missing manifest keys: {', '.join(missing)}")
    validate_manifest_generated_at_utc(manifest["generated_at_utc"])
    validate_manifest_window_hours(manifest["window_hours"])
    validate_manifest_verify_limit(manifest["verify_limit"])
    validate_manifest_render_threshold(manifest["render_duration_p95_threshold_seconds"])
    validate_manifest_checker_exit_code(manifest["checker_exit_code"])
    validate_manifest_cutover_decision(manifest["cutover_decision"], checker_exit_code=manifest["checker_exit_code"])
    validate_manifest_artifacts(manifest["artifacts"])


def validate_manifest_generated_at_utc(value: Any) -> None:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise CutoverManifestValidationError("manifest.generated_at_utc must be UTC ISO timestamp")
    try:
        datetime.fromisoformat(value.removesuffix("Z") + "+00:00")
    except ValueError as exc:
        raise CutoverManifestValidationError("manifest.generated_at_utc must be UTC ISO timestamp") from exc


def validate_manifest_window_hours(value: Any) -> None:
    if type(value) is not int:
        raise CutoverManifestValidationError("manifest.window_hours must be an integer")
    if value < MIN_WINDOW_HOURS:
        raise CutoverManifestValidationError(f"manifest.window_hours must be at least {MIN_WINDOW_HOURS}")


def validate_manifest_verify_limit(value: Any) -> None:
    if type(value) is not int or value <= 0:
        raise CutoverManifestValidationError("manifest.verify_limit must be positive")


def validate_manifest_render_threshold(value: Any) -> None:
    if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
        raise CutoverManifestValidationError("manifest.render_duration_p95_threshold_seconds must be positive")


def validate_manifest_checker_exit_code(value: Any) -> None:
    if type(value) is not int or value not in CHECKER_ALLOWED_EXIT_CODES:
        raise CutoverManifestValidationError("unexpected manifest checker exit code")


def validate_manifest_cutover_decision(decision: Any, *, checker_exit_code: int) -> None:
    if not isinstance(decision, dict):
        raise CutoverManifestValidationError("manifest cutover_decision must be a JSON object")
    missing = sorted(REQUIRED_DECISION_KEYS - decision.keys())
    if missing:
        raise CutoverManifestValidationError(f"missing manifest cutover_decision keys: {', '.join(missing)}")
    validate_manifest_decision_check_list(decision["failed_checks"], "failed_checks")
    validate_manifest_decision_check_list(decision["unknown_checks"], "unknown_checks")
    validate_manifest_blocking_check_lists_do_not_overlap(decision)
    if checker_exit_code == CHECKER_SUCCESS_EXIT_CODE:
        validate_manifest_decision_values(decision, SUCCESS_DECISION_VALUES)
    if checker_exit_code == EXIT_GATE_FAILED:
        expected = manifest_gate_failed_decision_values(decision)
        validate_manifest_decision_values(decision, expected)
        if not decision["failed_checks"] and not decision["unknown_checks"]:
            raise CutoverManifestValidationError("gate-failed manifest must include blocking checks")
        if expected is PARTIAL_READ_DECISION_VALUES and not can_promote_read_default(
            decision["failed_checks"],
            decision["unknown_checks"],
        ):
            raise CutoverManifestValidationError("partial read-default manifest has disallowed blocking checks")


def manifest_gate_failed_decision_values(decision: dict[str, Any]) -> dict[str, Any]:
    if decision.get("phase8_status") == PHASE8_STATUS_PARTIAL:
        return PARTIAL_READ_DECISION_VALUES
    return GATE_FAILED_DECISION_VALUES


def validate_manifest_decision_check_list(value: Any, label: str) -> None:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise CutoverManifestValidationError(f"manifest cutover_decision.{label} must be a list of strings")
    seen: set[str] = set()
    for item in value:
        if item in seen:
            raise CutoverManifestValidationError(f"duplicate manifest blocking check: {item}")
        seen.add(item)
    unexpected = [item for item in value if item not in REQUIRED_CHECK_NAMES]
    if unexpected:
        raise CutoverManifestValidationError(f"unexpected manifest blocking checks: {', '.join(unexpected)}")
    if value != [name for name in REQUIRED_CHECK_NAMES if name in value]:
        raise CutoverManifestValidationError("manifest blocking checks must match canonical order")


def validate_manifest_blocking_check_lists_do_not_overlap(decision: dict[str, Any]) -> None:
    overlap = sorted(set(decision["failed_checks"]) & set(decision["unknown_checks"]))
    if overlap:
        raise CutoverManifestValidationError(
            f"manifest blocking check cannot be both failed and unknown: {', '.join(overlap)}"
        )


def validate_manifest_decision_values(decision: dict[str, Any], expected: dict[str, Any]) -> None:
    for key, expected_value in expected.items():
        if decision[key] != expected_value or type(decision[key]) is not type(expected_value):
            raise CutoverManifestValidationError(f"manifest cutover_decision.{key} must be {expected_value!r}")


def validate_manifest_artifacts(artifacts: Any) -> None:
    if not isinstance(artifacts, list) or not artifacts:
        raise CutoverReportValidationError("manifest artifacts must be a non-empty list")
    seen: list[str] = []
    for artifact in artifacts:
        validate_manifest_artifact(artifact, seen)
    validate_manifest_artifact_names(seen)


def validate_manifest_artifact(artifact: Any, seen: list[str]) -> None:
    if not isinstance(artifact, dict):
        raise CutoverReportValidationError("manifest artifact must be a JSON object")
    name = artifact.get("name")
    if not isinstance(name, str) or not name:
        raise CutoverReportValidationError("manifest artifact.name must be a non-empty string")
    if name in seen:
        raise CutoverReportValidationError(f"duplicate manifest artifact: {name}")
    seen.append(name)
    validate_manifest_artifact_payload(name, artifact)


def validate_manifest_artifact_payload(name: str, artifact: dict[str, Any]) -> None:
    if type(artifact.get("bytes")) is not int or artifact["bytes"] <= 0:
        raise CutoverReportValidationError(f"manifest artifact must be non-empty: {name}")
    if not isinstance(artifact.get("path"), str) or not artifact["path"]:
        raise CutoverReportValidationError(f"manifest artifact.path must be a non-empty string: {name}")
    expected_path = REQUIRED_MANIFEST_ARTIFACT_PATHS.get(name)
    if expected_path is not None and artifact["path"] != expected_path:
        raise CutoverReportValidationError(f"manifest artifact.path must match expected file: {name}")
    sha256 = artifact.get("sha256")
    if not isinstance(sha256, str) or not is_sha256_hex(sha256):
        raise CutoverReportValidationError(f"manifest artifact.sha256 must be a 64-character hex string: {name}")


def validate_manifest_artifact_names(seen: list[str]) -> None:
    unexpected = [name for name in seen if name not in REQUIRED_MANIFEST_ARTIFACT_NAMES]
    if unexpected:
        raise CutoverReportValidationError(f"unexpected manifest artifacts: {', '.join(unexpected)}")
    missing = [name for name in REQUIRED_MANIFEST_ARTIFACT_NAMES if name not in seen]
    if missing:
        raise CutoverReportValidationError(f"missing manifest artifacts: {', '.join(missing)}")
    if seen != list(REQUIRED_MANIFEST_ARTIFACT_NAMES):
        raise CutoverReportValidationError("manifest artifacts must match required order")


def is_sha256_hex(value: str) -> bool:
    return len(value) == SHA256_HEX_LENGTH and all(char in "0123456789abcdef" for char in value.lower())
