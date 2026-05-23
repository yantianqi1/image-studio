from __future__ import annotations

from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))

from go_image_api_cutover_test_helpers import (  # noqa: E402
    create_cutover_test_engine,
    load_check_script_module,
    seed_image_item,
    utc_now_naive,
)


def test_external_evidence_can_be_read_from_logs_metrics_and_assetctl(tmp_path) -> None:
    module = load_script_module()
    access_log = tmp_path / "nginx-access.log"
    access_log.write_text(
        "\n".join([
            '10.0.0.1 - - [22/May/2026:10:00:00 +0800] "POST /api/public/image/jobs HTTP/1.1" 201 123',
            '10.0.0.1 - - [22/May/2026:10:01:00 +0800] "POST /api/public/image/jobs HTTP/1.1" 502 123 route_upstream="http://image-api-go:7810"',
            '10.0.0.1 - - [22/May/2026:10:02:00 +0800] "GET /api/public/image/jobs/1 HTTP/1.1" 500 123',
        ]),
        encoding="utf-8",
    )
    metrics = tmp_path / "worker.metrics"
    metrics.write_text("image_worker_heartbeat_failed_total 2\n", encoding="utf-8")
    asset_verify = tmp_path / "assetctl.out"
    asset_verify.write_text("assets checked=100 missing=3 mismatched=0\n", encoding="utf-8")
    rollback = tmp_path / "rollback-drill.txt"
    rollback.write_text("rollback_drill_passed=true\n", encoding="utf-8")

    evidence = module.resolve_external_evidence(
        create_5xx_rate=None,
        nginx_access_logs=[access_log],
        create_go_upstream_count=None,
        create_non_go_upstream_count=None,
        create_unknown_upstream_count=None,
        rollback_drill_passed=None,
        rollback_drill_evidence_file=rollback,
        worker_heartbeat_failed_count=None,
        worker_metrics_file=metrics,
        asset_missing_count=None,
        asset_mismatched_count=None,
        asset_verify_output_file=asset_verify,
        render_duration_p95_threshold_seconds=60,
    )

    assert evidence.create_5xx_rate == 0.5
    assert evidence.create_go_upstream_count == 1
    assert evidence.create_non_go_upstream_count == 0
    assert evidence.create_unknown_upstream_count == 1
    assert evidence.worker_heartbeat_failed_count == 2
    assert evidence.asset_missing_count == 3
    assert evidence.asset_mismatched_count == 0
    assert evidence.rollback_drill_passed is True


@pytest.mark.parametrize("marker", ["TODO", "synthetic", "(mock)"])
def test_external_evidence_rejects_placeholder_files(tmp_path, marker: str) -> None:
    module = load_script_module()
    asset_verify = tmp_path / "assetctl.out"
    asset_verify.write_text(f"{marker} replace with real assetctl output\nassets checked=100 missing=0 mismatched=0\n", encoding="utf-8")

    with pytest.raises(ValueError, match="placeholder marker"):
        module.resolve_external_evidence(
            create_5xx_rate=0.0,
            nginx_access_logs=[],
            create_go_upstream_count=1,
            create_non_go_upstream_count=0,
            create_unknown_upstream_count=0,
            rollback_drill_passed=True,
            rollback_drill_evidence_file=None,
            worker_heartbeat_failed_count=0,
            worker_metrics_file=None,
            asset_missing_count=None,
            asset_mismatched_count=None,
            asset_verify_output_file=asset_verify,
            render_duration_p95_threshold_seconds=60,
        )


def test_cutover_cli_rejects_boolean_rollback_drill_without_evidence_file() -> None:
    module = load_script_module()

    with pytest.raises(SystemExit):
        module.build_parser().parse_args(["--rollback-drill-passed"])


@pytest.mark.parametrize(
    "flag",
    [
        "--create-5xx-rate",
        "--create-go-upstream-count",
        "--create-non-go-upstream-count",
        "--create-unknown-upstream-count",
        "--worker-heartbeat-failed-count",
        "--asset-missing-count",
        "--asset-mismatched-count",
    ],
)
def test_cutover_cli_rejects_manual_evidence_count_flags(flag: str) -> None:
    module = load_script_module()

    with pytest.raises(SystemExit):
        module.build_parser().parse_args([flag, "0"])


def test_cutover_cli_rejects_missing_required_evidence_files() -> None:
    module = load_script_module()
    args = module.build_parser().parse_args(["--database-url", "sqlite+pysqlite:///:memory:"])

    with pytest.raises(SystemExit):
        module.validate_args(args)


def test_cutover_cli_rejects_missing_render_duration_threshold() -> None:
    module = load_script_module()
    args = module.build_parser().parse_args([
        "--database-url",
        "sqlite+pysqlite:///:memory:",
        "--nginx-access-log",
        "nginx.log",
        "--worker-metrics-file",
        "worker.metrics",
        "--asset-verify-output-file",
        "assetctl.out",
        "--rollback-drill-evidence-file",
        "rollback.txt",
    ])

    with pytest.raises(SystemExit, match="--render-duration-p95-threshold-seconds is required"):
        module.validate_args(args)


def test_cutover_gate_fails_when_asset_verify_reports_mismatches(tmp_path) -> None:
    module = load_script_module()
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now)
    metrics = tmp_path / "worker.metrics"
    metrics.write_text("image_worker_heartbeat_failed_total 0\n", encoding="utf-8")
    asset_verify = tmp_path / "assetctl.out"
    asset_verify.write_text("assets checked=100 missing=0 mismatched=1\n", encoding="utf-8")
    evidence = module.resolve_external_evidence(
        create_5xx_rate=0.0,
        nginx_access_logs=[],
        create_go_upstream_count=1,
        create_non_go_upstream_count=0,
        create_unknown_upstream_count=0,
        rollback_drill_passed=True,
        rollback_drill_evidence_file=None,
        worker_heartbeat_failed_count=None,
        worker_metrics_file=metrics,
        asset_missing_count=None,
        asset_mismatched_count=None,
        asset_verify_output_file=asset_verify,
        render_duration_p95_threshold_seconds=60,
    )

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert "asset_mismatched_count" in failed_checks


def test_cutover_gate_fails_without_go_create_upstream_evidence(tmp_path) -> None:
    module = load_script_module()
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now)
    access_log = tmp_path / "nginx-access.log"
    access_log.write_text(
        '10.0.0.1 - - [22/May/2026:10:00:00 +0800] "POST /api/public/image/jobs HTTP/1.1" 201 123\n',
        encoding="utf-8",
    )
    evidence = external_evidence_from_log(module, access_log)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert "create_go_upstream_count" in failed_checks


def test_cutover_gate_fails_when_any_create_uses_non_go_upstream(tmp_path) -> None:
    module = load_script_module()
    engine = create_cutover_test_engine()
    now = utc_now_naive()
    seed_image_item(engine, status="succeeded", now=now)
    access_log = tmp_path / "nginx-access.log"
    access_log.write_text(
        "\n".join([
            '10.0.0.1 - - [22/May/2026:10:00:00 +0800] "POST /api/public/image/jobs HTTP/1.1" 201 123 route_upstream="http://image-api-go:7810"',
            '10.0.0.1 - - [22/May/2026:10:01:00 +0800] "POST /api/public/image/jobs HTTP/1.1" 201 123 route_upstream="http://api:7800"',
        ]),
        encoding="utf-8",
    )
    evidence = external_evidence_from_log(module, access_log)

    report = module.build_report(engine, window_hours=24, evidence=evidence, dead_letter_growth_max=0)

    failed_checks = {check["name"] for check in report["checks"] if check["status"] == "fail"}
    assert report["passed"] is False
    assert "create_non_go_upstream_count" in failed_checks


def test_external_evidence_rejects_conflicting_rollback_drill_result(tmp_path) -> None:
    load_script_module()
    from go_image_api_cutover_evidence import rollback_drill_passed_from_file

    rollback = tmp_path / "rollback-drill.txt"
    rollback.write_text(
        "operator=release\nrollback_drill_passed=true\nrollback_drill_passed=false\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="conflicting rollback drill evidence"):
        rollback_drill_passed_from_file(rollback)


def external_evidence_from_log(module, access_log: Path):
    return module.resolve_external_evidence(
        create_5xx_rate=None,
        nginx_access_logs=[access_log],
        create_go_upstream_count=None,
        create_non_go_upstream_count=None,
        create_unknown_upstream_count=None,
        rollback_drill_passed=True,
        rollback_drill_evidence_file=None,
        worker_heartbeat_failed_count=0,
        worker_metrics_file=None,
        asset_missing_count=0,
        asset_mismatched_count=0,
        asset_verify_output_file=None,
        render_duration_p95_threshold_seconds=60,
    )


def load_script_module():
    return load_check_script_module("check_go_image_api_cutover_external")
