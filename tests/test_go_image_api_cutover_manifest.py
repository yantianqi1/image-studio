from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_manifest import (  # noqa: E402
    CutoverManifestValidationError,
    validate_cutover_manifest,
)


def test_manifest_rejects_missing_top_level_key() -> None:
    manifest = valid_manifest()
    manifest.pop("checker_exit_code")

    with pytest.raises(CutoverManifestValidationError, match="missing manifest keys: checker_exit_code"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_short_window_hours() -> None:
    manifest = valid_manifest()
    manifest["window_hours"] = 23

    with pytest.raises(CutoverManifestValidationError, match="manifest.window_hours must be at least 24"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_non_positive_verify_limit() -> None:
    manifest = valid_manifest()
    manifest["verify_limit"] = 0

    with pytest.raises(CutoverManifestValidationError, match="manifest.verify_limit must be positive"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_unexpected_checker_exit_code() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 69

    with pytest.raises(CutoverManifestValidationError, match="unexpected manifest checker exit code"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_incomplete_cutover_decision() -> None:
    manifest = valid_manifest()
    manifest["cutover_decision"] = {"phase8_status": "complete"}

    with pytest.raises(CutoverManifestValidationError, match="missing manifest cutover_decision keys"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_success_exit_with_blocked_decision() -> None:
    manifest = valid_manifest()
    manifest["cutover_decision"] = blocked_decision(failed_checks=["items_in_window"])

    with pytest.raises(CutoverManifestValidationError, match="manifest cutover_decision.phase8_status"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_gate_failed_decision_without_blocking_checks() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 2
    manifest["cutover_decision"] = blocked_decision()

    with pytest.raises(CutoverManifestValidationError, match="gate-failed manifest must include blocking checks"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_unknown_blocking_check_names() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 2
    manifest["cutover_decision"] = blocked_decision(failed_checks=["synthetic_success"])

    with pytest.raises(CutoverManifestValidationError, match="unexpected manifest blocking checks: synthetic_success"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_duplicate_blocking_check_names() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 2
    manifest["cutover_decision"] = blocked_decision(failed_checks=["items_in_window", "items_in_window"])

    with pytest.raises(CutoverManifestValidationError, match="duplicate manifest blocking check: items_in_window"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_check_in_failed_and_unknown_lists() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 2
    manifest["cutover_decision"] = blocked_decision(
        failed_checks=["items_in_window"],
        unknown_checks=["items_in_window"],
    )

    with pytest.raises(CutoverManifestValidationError, match="manifest blocking check cannot be both failed and unknown"):
        validate_cutover_manifest(manifest)


def test_manifest_accepts_partial_read_default_decision_for_create_gray_gate() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 2
    manifest["cutover_decision"] = partial_read_decision(failed_checks=["create_non_go_upstream_count"])

    validate_cutover_manifest(manifest)


def test_manifest_rejects_partial_read_default_decision_for_5xx_risk() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 2
    manifest["cutover_decision"] = partial_read_decision(failed_checks=["create_5xx_rate"])

    with pytest.raises(CutoverManifestValidationError, match="partial read-default manifest"):
        validate_cutover_manifest(manifest)


def test_manifest_rejects_blocking_check_order_drift() -> None:
    manifest = valid_manifest()
    manifest["checker_exit_code"] = 2
    manifest["cutover_decision"] = blocked_decision(
        failed_checks=["create_5xx_rate", "items_in_window"],
    )

    with pytest.raises(CutoverManifestValidationError, match="manifest blocking checks must match canonical order"):
        validate_cutover_manifest(manifest)


@pytest.mark.parametrize("generated_at_utc", ["not-a-time", "2026-05-23T00:00:00+08:00"])
def test_manifest_rejects_invalid_generated_at_utc(generated_at_utc: str) -> None:
    manifest = valid_manifest()
    manifest["generated_at_utc"] = generated_at_utc

    with pytest.raises(CutoverManifestValidationError, match="manifest.generated_at_utc must be UTC ISO timestamp"):
        validate_cutover_manifest(manifest)


def valid_manifest() -> dict[str, object]:
    return {
        "generated_at_utc": "2026-05-23T00:00:00Z",
        "window_hours": 24,
        "verify_limit": 1000,
        "render_duration_p95_threshold_seconds": 180.0,
        "checker_exit_code": 0,
        "cutover_decision": {
            "phase8_status": "complete",
            "go_image_api_read_default_allowed": True,
            "go_image_api_create_default_allowed": True,
            "next_action": "promote_go_image_api_read_create",
            "failed_checks": [],
            "unknown_checks": [],
        },
        "artifacts": valid_manifest_artifacts(),
    }


def valid_manifest_artifacts() -> list[dict[str, object]]:
    names = {
        "preflight": "preflight.txt",
        "raw_nginx_access_log": "nginx-access.raw.log",
        "nginx_access_log": "nginx-access.log",
        "worker_metrics": "worker-go.metrics",
        "asset_verify": "assetctl-verify-assets.out",
        "rollback_drill": "rollback-drill.txt",
        "cutover_report": "go-image-api-cutover-report.json",
    }
    return [
        {"name": name, "path": path, "bytes": 1, "sha256": "a" * 64}
        for name, path in names.items()
    ]


def blocked_decision(*, failed_checks: list[str] | None = None, unknown_checks: list[str] | None = None) -> dict[str, object]:
    return {
        "phase8_status": "blocked",
        "go_image_api_read_default_allowed": False,
        "go_image_api_create_default_allowed": False,
        "next_action": "keep_go_image_api_gated",
        "failed_checks": failed_checks or [],
        "unknown_checks": unknown_checks or [],
    }


def partial_read_decision(*, failed_checks: list[str]) -> dict[str, object]:
    return {
        "phase8_status": "partial",
        "go_image_api_read_default_allowed": True,
        "go_image_api_create_default_allowed": False,
        "next_action": "promote_go_image_api_read_keep_create_gray",
        "failed_checks": failed_checks,
        "unknown_checks": [],
    }
