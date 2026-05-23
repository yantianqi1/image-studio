from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from go_image_api_cutover_collect_lib import CutoverReportValidationError, manifest_cutover_decision
from go_image_api_cutover_manifest import CutoverManifestValidationError, validate_cutover_manifest


MANIFEST_FILE_NAME = "manifest.json"
CUTOVER_REPORT_ARTIFACT_NAME = "cutover_report"


class CutoverBundleValidationError(ValueError):
    pass


def validate_cutover_evidence_bundle(evidence_dir: Path) -> dict[str, Any]:
    try:
        manifest = load_manifest(evidence_dir)
        validate_cutover_manifest(manifest)
        validate_manifest_artifact_files(evidence_dir, manifest["artifacts"])
        validate_manifest_report_decision(evidence_dir, manifest)
    except (CutoverManifestValidationError, CutoverReportValidationError, OSError, json.JSONDecodeError) as exc:
        raise CutoverBundleValidationError(str(exc)) from exc
    return manifest


def load_manifest(evidence_dir: Path) -> dict[str, Any]:
    path = evidence_dir / MANIFEST_FILE_NAME
    if not path.is_file() or path.stat().st_size == 0:
        raise CutoverBundleValidationError(f"missing or empty {MANIFEST_FILE_NAME}")
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise CutoverBundleValidationError("manifest must be a JSON object")
    return manifest


def validate_manifest_artifact_files(evidence_dir: Path, artifacts: list[dict[str, Any]]) -> None:
    for artifact in artifacts:
        validate_manifest_artifact_file(evidence_dir, artifact)


def validate_manifest_artifact_file(evidence_dir: Path, artifact: dict[str, Any]) -> None:
    name = str(artifact["name"])
    path = evidence_dir / str(artifact["path"])
    if not path.is_file():
        raise CutoverBundleValidationError(f"missing manifest artifact file: {name}")
    payload = path.read_bytes()
    if len(payload) != artifact["bytes"]:
        raise CutoverBundleValidationError(f"artifact byte count mismatch: {name}")
    if hashlib.sha256(payload).hexdigest() != artifact["sha256"]:
        raise CutoverBundleValidationError(f"artifact sha256 mismatch: {name}")


def validate_manifest_report_decision(evidence_dir: Path, manifest: dict[str, Any]) -> None:
    report_path = report_artifact_path(evidence_dir, manifest["artifacts"])
    decision = manifest_cutover_decision(report_path, checker_exit_code=manifest["checker_exit_code"])
    if manifest["cutover_decision"] != decision:
        raise CutoverBundleValidationError("manifest cutover_decision must match cutover report")


def report_artifact_path(evidence_dir: Path, artifacts: list[dict[str, Any]]) -> Path:
    for artifact in artifacts:
        if artifact["name"] == CUTOVER_REPORT_ARTIFACT_NAME:
            return evidence_dir / str(artifact["path"])
    raise CutoverBundleValidationError("missing cutover report artifact")
