from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
COLLECT_SCRIPT = ROOT / "scripts/collect-go-image-api-cutover-evidence.sh"
COLLECT_PREFLIGHT_SCRIPT = ROOT / "scripts/go-image-api-cutover-collector-preflight.sh"
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_collect_lib import (  # noqa: E402
    CutoverReportValidationError,
    REQUIRED_CHECK_NAMES,
    manifest_cutover_decision,
    validate_cutover_report,
)
import go_image_api_cutover_check_lib  # noqa: E402
from go_image_api_cutover_check_lib import MIN_WINDOW_HOURS  # noqa: E402


COLLECTOR_REQUIRED_FRAGMENTS = (
    "required_services",
    "preflight.txt",
    "manifest.json",
    "MANIFEST_JSON",
    "SCRIPT_DIR",
    'source "$SCRIPT_DIR/go-image-api-cutover-collector-preflight.sh"',
    "validate_collector_inputs",
    "PREFLIGHT_REPORT",
    "services_running",
    "image-api-go",
    "worker-go",
    "postgres",
    "nginx",
    "docker compose ps --status running --services",
    "required_worker_mode",
    "GO_WORKER_MODE",
    "required_route_flags",
    "required_image_api_flags",
    "GO_IMAGE_API_READS_ENABLED",
    "GO_IMAGE_API_ASSETS_ENABLED",
    "GO_IMAGE_API_SSE_ENABLED",
    "GO_IMAGE_API_CREATE_ENABLED",
    "ASSET_STORAGE_BACKEND",
    "docker compose exec -T \"$service\" printenv \"$key\"",
    "unhealthy_endpoint",
    "http://127.0.0.1:7810/readyz",
    "http://127.0.0.1:7900/readyz",
    "RAW_NGINX_LOG",
    "raw_nginx_access_log",
    "docker compose exec -T nginx cat /var/log/nginx/access.log",
    "filter_nginx_access_log",
    "filter_nginx_access_log_text",
    "docker compose exec -T worker-go wget -qO- http://127.0.0.1:7900/metrics",
    "docker compose exec -T worker-go /app/assetctl verify-assets",
    "scripts/check-go-image-api-cutover.py",
    "CHECK_EXIT",
    "checker_exit_code",
    "validate_cutover_report",
    "empty cutover report",
    "invalid cutover report JSON",
    "go_image_api_cutover_collect_lib",
    "manifest_cutover_decision",
    "validate_cutover_manifest",
    '"cutover_decision"',
    "sys.path.insert",
    "CutoverReportValidationError",
    "validate_cutover_report_file",
    "artifacts",
    "sha256",
    "--nginx-access-log",
    "--worker-metrics-file",
    "--asset-verify-output-file",
    "RENDER_DURATION_P95_THRESHOLD_SECONDS",
    "ROLLBACK_DRILL_EVIDENCE_FILE",
    "rollback-drill.txt",
    "ROLLBACK_DRILL",
    "--rollback-drill-evidence-file",
)


def test_cutover_evidence_collector_runs_real_evidence_commands() -> None:
    source = COLLECT_SCRIPT.read_text()

    for text in COLLECTOR_REQUIRED_FRAGMENTS:
        assert text in source

    assert "(mock)" not in source
    assert "|| true" not in source


def test_cutover_evidence_collector_rejects_invalid_window_before_docker() -> None:
    source = COLLECT_SCRIPT.read_text()
    preflight_source = COLLECT_PREFLIGHT_SCRIPT.read_text()

    assert source.index('source "$SCRIPT_DIR/go-image-api-cutover-collector-preflight.sh"') < source.index("\nvalidate_collector_inputs\n")
    assert 'require_integer_at_least WINDOW_HOURS "$WINDOW_HOURS" 24' in preflight_source
    assert "$name must be an integer" in preflight_source
    assert "$name must be at least $minimum" in preflight_source
    assert source.index("\nvalidate_collector_inputs\n") < source.index('docker compose ps --status running --services')
    assert "|| true" not in preflight_source


def test_cutover_report_validation_rejects_incomplete_decision() -> None:
    report = full_valid_report()
    report["cutover_decision"] = {"phase8_status": "complete"}

    with pytest.raises(CutoverReportValidationError, match="missing cutover_decision keys"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_decision_that_contradicts_failed_report() -> None:
    report = full_valid_report()
    report["passed"] = False
    report["cutover_decision"] = {
        "phase8_status": "blocked",
        "go_image_api_read_default_allowed": True,
        "go_image_api_create_default_allowed": False,
        "next_action": "keep_go_image_api_gated",
        "failed_checks": [],
        "unknown_checks": [],
    }

    with pytest.raises(CutoverReportValidationError, match="cutover_decision.go_image_api_read_default_allowed"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_empty_checks() -> None:
    report = full_valid_report()
    report["checks"] = []

    with pytest.raises(CutoverReportValidationError, match="empty checks"):
        validate_cutover_report(report)


def test_collector_uses_checker_canonical_gate_names() -> None:
    assert hasattr(go_image_api_cutover_check_lib, "REQUIRED_CHECK_NAMES")
    assert REQUIRED_CHECK_NAMES == go_image_api_cutover_check_lib.REQUIRED_CHECK_NAMES


def test_cutover_report_validation_rejects_invalid_check_entries() -> None:
    report = full_valid_report()
    report["checks"] = [{"name": "items_in_window", "status": "skipped"}]

    with pytest.raises(CutoverReportValidationError, match="check.status must be pass/fail/unknown"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_missing_required_gate() -> None:
    report = full_valid_report()
    report["checks"] = [check for check in report["checks"] if check["name"] != "asset_missing_count"]

    with pytest.raises(CutoverReportValidationError, match="missing required cutover checks: asset_missing_count"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_unexpected_gate_names() -> None:
    report = full_valid_report()
    report["checks"].append({"name": "synthetic_success", "status": "pass", "value": 1, "threshold": 1})

    with pytest.raises(CutoverReportValidationError, match="unexpected cutover checks: synthetic_success"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_required_gate_order_drift() -> None:
    report = full_valid_report()
    checks = report["checks"]
    checks[0], checks[1] = checks[1], checks[0]

    with pytest.raises(CutoverReportValidationError, match="cutover checks must match required order"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_duplicate_gate_names() -> None:
    report = full_valid_report()
    report["checks"].append({"name": "items_in_window", "status": "pass", "value": 1, "threshold": 1})

    with pytest.raises(CutoverReportValidationError, match="duplicate cutover check: items_in_window"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_failed_report_without_blocking_checks() -> None:
    report = full_valid_report()
    report["passed"] = False
    report["cutover_decision"] = {
        "phase8_status": "blocked",
        "go_image_api_read_default_allowed": False,
        "go_image_api_create_default_allowed": False,
        "next_action": "keep_go_image_api_gated",
        "failed_checks": [],
        "unknown_checks": [],
    }

    with pytest.raises(CutoverReportValidationError, match="failed reports must include fail or unknown checks"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_mismatched_blocked_check_lists() -> None:
    report = blocked_report()
    report["cutover_decision"]["failed_checks"] = []
    update_check(report, "create_5xx_rate", value=None)

    with pytest.raises(CutoverReportValidationError, match="failed_checks must match checks with status fail"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_passed_report_with_unknown_checks() -> None:
    report = full_valid_report()
    update_check(report, "asset_missing_count", status="unknown", value=None)

    with pytest.raises(CutoverReportValidationError, match="unknown_checks must match checks with status unknown"):
        validate_cutover_report(report)


def test_cutover_report_validation_rejects_invalid_check_name_lists() -> None:
    report = full_valid_report()
    report["cutover_decision"]["unknown_checks"] = [None]

    with pytest.raises(CutoverReportValidationError, match="unknown_checks must be a list of strings"):
        validate_cutover_report(report)


def test_manifest_cutover_decision_returns_validated_decision(tmp_path) -> None:
    report_path = tmp_path / "go-image-api-cutover-report.json"
    report_path.write_text(__import__("json").dumps(full_valid_report()), encoding="utf-8")

    assert manifest_cutover_decision(report_path) == full_valid_report()["cutover_decision"]


def full_valid_report() -> dict[str, object]:
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


def update_check(report: dict[str, object], name: str, **updates: object) -> None:
    checks = report["checks"]
    assert isinstance(checks, list)
    for check in checks:
        if check["name"] == name:
            check.update(updates)
            return
    raise AssertionError(name)


def blocked_report() -> dict[str, object]:
    report = full_valid_report()
    report["passed"] = False
    report["summary"] = {"items_in_window": 0}
    update_check(report, "items_in_window", status="fail", value=0, threshold=1)
    update_check(report, "create_5xx_rate", status="unknown")
    report["cutover_decision"] = {
        "phase8_status": "blocked",
        "go_image_api_read_default_allowed": False,
        "go_image_api_create_default_allowed": False,
        "next_action": "keep_go_image_api_gated",
        "failed_checks": ["items_in_window"],
        "unknown_checks": ["create_5xx_rate"],
    }
    return report
