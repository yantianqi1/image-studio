from pathlib import Path
import hashlib
import json
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
VERIFY_SCRIPT = ROOT / "scripts/verify-go-image-api-cutover-evidence.py"
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_bundle import (  # noqa: E402
    CutoverBundleValidationError,
    validate_cutover_evidence_bundle,
)
from go_image_api_cutover_check_lib import MIN_WINDOW_HOURS, REQUIRED_CHECK_NAMES  # noqa: E402
from go_image_api_cutover_manifest import REQUIRED_MANIFEST_ARTIFACT_NAMES  # noqa: E402


def test_bundle_validation_accepts_matching_manifest_and_artifacts(tmp_path: Path) -> None:
    manifest = write_bundle(tmp_path, valid_report())

    assert validate_cutover_evidence_bundle(tmp_path) == manifest


def test_bundle_validation_rejects_artifact_hash_mismatch(tmp_path: Path) -> None:
    write_bundle(tmp_path, valid_report())
    (tmp_path / "worker-go.metrics").write_text("image_worker_heartbeat_failed_total 1\n", encoding="utf-8")

    with pytest.raises(CutoverBundleValidationError, match="artifact sha256 mismatch: worker_metrics"):
        validate_cutover_evidence_bundle(tmp_path)


def test_bundle_validation_rejects_manifest_decision_that_differs_from_report(tmp_path: Path) -> None:
    manifest = write_bundle(tmp_path, blocked_report())
    manifest["cutover_decision"] = blocked_decision(failed_checks=["create_5xx_rate"])
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    with pytest.raises(CutoverBundleValidationError, match="manifest cutover_decision must match cutover report"):
        validate_cutover_evidence_bundle(tmp_path)


def test_bundle_verify_script_uses_bundle_validator() -> None:
    source = VERIFY_SCRIPT.read_text(encoding="utf-8")

    assert "validate_cutover_evidence_bundle" in source
    assert "CutoverBundleValidationError" in source


def write_bundle(evidence_dir: Path, report: dict[str, object]) -> dict[str, object]:
    payloads = {
        "preflight.txt": "preflight\n",
        "nginx-access.raw.log": "raw\n",
        "nginx-access.log": "filtered\n",
        "worker-go.metrics": "image_worker_heartbeat_failed_total 0\n",
        "assetctl-verify-assets.out": "checked=1 missing=0 mismatched=0\n",
        "rollback-drill.txt": "rollback_drill_passed=true\n",
        "go-image-api-cutover-report.json": json.dumps(report),
    }
    for path, text in payloads.items():
        (evidence_dir / path).write_text(text, encoding="utf-8")
    manifest = {
        "generated_at_utc": "2026-05-23T00:00:00Z",
        "window_hours": MIN_WINDOW_HOURS,
        "verify_limit": 1000,
        "render_duration_p95_threshold_seconds": 180.0,
        "checker_exit_code": 0 if report["passed"] else 2,
        "cutover_decision": dict(report["cutover_decision"]),
        "artifacts": [artifact(evidence_dir, name) for name in REQUIRED_MANIFEST_ARTIFACT_NAMES],
    }
    (evidence_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return manifest


def artifact(evidence_dir: Path, name: str) -> dict[str, object]:
    path = artifact_paths()[name]
    payload = (evidence_dir / path).read_bytes()
    return {"name": name, "path": path, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}


def artifact_paths() -> dict[str, str]:
    return {
        "preflight": "preflight.txt",
        "raw_nginx_access_log": "nginx-access.raw.log",
        "nginx_access_log": "nginx-access.log",
        "worker_metrics": "worker-go.metrics",
        "asset_verify": "assetctl-verify-assets.out",
        "rollback_drill": "rollback-drill.txt",
        "cutover_report": "go-image-api-cutover-report.json",
    }


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


def blocked_report() -> dict[str, object]:
    report = valid_report()
    report["passed"] = False
    report["summary"] = {"items_in_window": 0}
    report["checks"][0]["status"] = "fail"
    report["checks"][0]["value"] = 0
    report["cutover_decision"] = blocked_decision(failed_checks=["items_in_window"])
    return report


def blocked_decision(*, failed_checks: list[str]) -> dict[str, object]:
    return {
        "phase8_status": "blocked",
        "go_image_api_read_default_allowed": False,
        "go_image_api_create_default_allowed": False,
        "next_action": "keep_go_image_api_gated",
        "failed_checks": failed_checks,
        "unknown_checks": [],
    }


def valid_check_value(name: str) -> object:
    if name == "rollback_drill_passed":
        return True
    if name in {"items_in_window", "create_go_upstream_count"}:
        return 1
    return 0
