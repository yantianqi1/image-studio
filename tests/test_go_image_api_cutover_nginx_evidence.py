from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from datetime import datetime, timezone

from go_image_api_cutover_evidence import (  # noqa: E402
    create_5xx_rate_from_logs,
    create_route_counts_from_logs,
    filter_nginx_access_log_text,
)


def test_create_5xx_rate_rejects_malformed_create_access_log_line(tmp_path) -> None:
    access_log = tmp_path / "nginx-access.log"
    access_log.write_text(
        '10.0.0.1 - - [22/May/2026:10:00:00 +0800] "POST /api/public/image/jobs HTTP/1.1" bad_status 123\n',
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="invalid nginx create access log line"):
        create_5xx_rate_from_logs([access_log])


def test_create_route_counts_rejects_duplicate_route_upstream_values(tmp_path) -> None:
    access_log = tmp_path / "nginx-access.log"
    access_log.write_text(
        '10.0.0.1 - - [22/May/2026:10:00:00 +0800] "POST /api/public/image/jobs HTTP/1.1" '
        '201 123 route_upstream="http://image-api-go:7810" route_upstream="http://api:7800"\n',
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="invalid nginx create route upstream evidence"):
        create_route_counts_from_logs([access_log])


def test_filter_nginx_access_log_rejects_create_line_without_timestamp() -> None:
    raw_log = '"POST /api/public/image/jobs HTTP/1.1" 201 123 route_upstream="http://image-api-go:7810"\n'
    since = datetime(2026, 5, 22, tzinfo=timezone.utc)

    with pytest.raises(ValueError, match="invalid nginx create access log timestamp"):
        filter_nginx_access_log_text(raw_log, since=since)


def test_filter_nginx_access_log_rejects_create_line_with_invalid_timestamp() -> None:
    raw_log = (
        '10.0.0.1 - - [22/Bad/2026:10:00:00 +0800] '
        '"POST /api/public/image/jobs HTTP/1.1" 201 123 route_upstream="http://image-api-go:7810"\n'
    )
    since = datetime(2026, 5, 22, tzinfo=timezone.utc)

    with pytest.raises(ValueError, match="invalid nginx create access log timestamp"):
        filter_nginx_access_log_text(raw_log, since=since)


def test_filter_nginx_access_log_ignores_non_create_line_with_invalid_timestamp() -> None:
    raw_log = "\n".join([
        '10.0.0.1 - - [22/Bad/2026:10:00:00 +0800] "GET /readyz HTTP/1.1" 200 2',
        '10.0.0.1 - - [22/May/2026:10:00:00 +0800] '
        '"POST /api/public/image/jobs HTTP/1.1" 201 123 route_upstream="http://image-api-go:7810"',
    ])
    since = datetime(2026, 5, 22, tzinfo=timezone.utc)

    assert filter_nginx_access_log_text(raw_log, since=since) == (
        '10.0.0.1 - - [22/May/2026:10:00:00 +0800] '
        '"POST /api/public/image/jobs HTTP/1.1" 201 123 route_upstream="http://image-api-go:7810"\n'
    )
