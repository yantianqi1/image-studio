import importlib.util
from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts/check-go-image-api-cutover.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("check_go_image_api_cutover_cli", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_cutover_cli_rejects_missing_evidence_file_paths(tmp_path) -> None:
    module = load_script_module()
    args = parse_valid_args(module, tmp_path)
    missing = tmp_path / "missing-nginx.log"
    args.nginx_access_log = [str(missing)]

    with pytest.raises(SystemExit, match="evidence file is missing: --nginx-access-log"):
        module.validate_args(args)


def test_cutover_cli_rejects_empty_evidence_files(tmp_path) -> None:
    module = load_script_module()
    args = parse_valid_args(module, tmp_path)
    empty = tmp_path / "empty-nginx.log"
    empty.write_text("", encoding="utf-8")
    args.nginx_access_log = [str(empty)]

    with pytest.raises(SystemExit, match="evidence file is empty: --nginx-access-log"):
        module.validate_args(args)


def test_cutover_cli_rejects_windows_shorter_than_24_hours(tmp_path) -> None:
    module = load_script_module()
    args = parse_valid_args(module, tmp_path, "--window-hours", "23")

    with pytest.raises(SystemExit, match="window-hours must be at least 24"):
        module.validate_args(args)


def test_cutover_cli_rejects_negative_dead_letter_growth_max(tmp_path) -> None:
    module = load_script_module()
    args = parse_valid_args(module, tmp_path, "--dead-letter-growth-max", "-1")

    with pytest.raises(SystemExit, match="dead-letter-growth-max must be zero or positive"):
        module.validate_args(args)


@pytest.mark.parametrize("threshold", ["0", "-1"])
def test_cutover_cli_rejects_non_positive_render_duration_threshold(tmp_path, threshold: str) -> None:
    module = load_script_module()
    args = parse_valid_args(module, tmp_path)
    args.render_duration_p95_threshold_seconds = float(threshold)

    with pytest.raises(SystemExit, match="render-duration-p95-threshold-seconds must be positive"):
        module.validate_args(args)


@pytest.mark.parametrize("threshold", ["nan", "inf"])
def test_cutover_cli_rejects_non_finite_render_duration_threshold(tmp_path, threshold: str) -> None:
    module = load_script_module()
    args = parse_valid_args(module, tmp_path)
    args.render_duration_p95_threshold_seconds = float(threshold)

    with pytest.raises(SystemExit, match="render-duration-p95-threshold-seconds must be positive"):
        module.validate_args(args)


def parse_valid_args(module, tmp_path: Path, *extra: str):
    existing = tmp_path / "evidence.txt"
    existing.write_text("real evidence\n", encoding="utf-8")
    return module.build_parser().parse_args([
        "--database-url",
        "sqlite+pysqlite:///:memory:",
        "--nginx-access-log",
        str(existing),
        "--worker-metrics-file",
        str(existing),
        "--asset-verify-output-file",
        str(existing),
        "--rollback-drill-evidence-file",
        str(existing),
        "--render-duration-p95-threshold-seconds",
        "60",
        *extra,
    ])
