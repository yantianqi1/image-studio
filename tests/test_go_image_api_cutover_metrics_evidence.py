from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_evidence import heartbeat_failed_count_from_metrics  # noqa: E402


def test_heartbeat_failed_metric_rejects_missing_metric(tmp_path) -> None:
    metrics = tmp_path / "worker.metrics"
    metrics.write_text("image_worker_jobs_claimed_total 10\n", encoding="utf-8")

    with pytest.raises(ValueError, match="missing heartbeat failed metric"):
        heartbeat_failed_count_from_metrics(metrics)


def test_heartbeat_failed_metric_rejects_fractional_counts(tmp_path) -> None:
    metrics = tmp_path / "worker.metrics"
    metrics.write_text("image_worker_heartbeat_failed_total 1.5\n", encoding="utf-8")

    with pytest.raises(ValueError, match="invalid heartbeat failed metric"):
        heartbeat_failed_count_from_metrics(metrics)


@pytest.mark.parametrize("value", ["-1", "NaN", "bad"])
def test_heartbeat_failed_metric_rejects_malformed_counts(tmp_path, value: str) -> None:
    metrics = tmp_path / "worker.metrics"
    metrics.write_text(f"image_worker_heartbeat_failed_total {value}\n", encoding="utf-8")

    with pytest.raises(ValueError, match="invalid heartbeat failed metric"):
        heartbeat_failed_count_from_metrics(metrics)
