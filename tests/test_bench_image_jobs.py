from __future__ import annotations

import importlib.util
import threading
import urllib.request
from http.server import HTTPServer
from pathlib import Path

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "bench-image-jobs.py"


def load_script():
    spec = importlib.util.spec_from_file_location("bench_image_jobs", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_seed_args_parse_required_shape():
    bench = load_script()

    args = bench.build_parser().parse_args(
        [
            "seed",
            "--jobs",
            "100",
            "--items-per-job",
            "4",
            "--owner-count",
            "10",
            "--provider-id",
            "2",
            "--model-code",
            "gpt-image-2",
            "--mode",
            "render-mock",
        ]
    )

    assert args.command == "seed"
    assert args.jobs == 100
    assert args.items_per_job == 4
    assert args.mode == "render-mock"


def test_production_guard_requires_explicit_override(monkeypatch):
    bench = load_script()
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(SystemExit, match="refusing to write benchmark data"):
        bench.ensure_non_production(False)


def test_mock_provider_serves_chat_response_and_image():
    bench = load_script()
    server = HTTPServer(("127.0.0.1", 0), bench.make_mock_provider_handler(delay_ms=0, fail_rate=0, image_format="png"))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_port}"
        request = urllib.request.Request(base_url + "/v1/chat/completions", method="POST", data=b"{}")
        with urllib.request.urlopen(request, timeout=2) as response:
            body = response.read().decode("utf-8")
        assert response.status == 200
        assert "/mock-image.png" in body
        with urllib.request.urlopen(base_url + "/mock-image.png", timeout=2) as image_response:
            image_body = image_response.read()
        assert image_response.headers["Content-Type"] == "image/png"
        assert image_body.startswith(b"\x89PNG")
    finally:
        server.shutdown()
        thread.join(timeout=2)


def test_fetch_db_connection_usage_queries_pg_stat_activity():
    bench = load_script()
    connection = FakeConnection()

    usage = bench.fetch_db_connection_usage(connection)

    assert usage == {"pg_stat_activity_connections": 7}
    assert "pg_stat_activity" in connection.queries[0]


class FakeScalarResult:
    def scalar_one(self) -> int:
        return 7


class FakeConnection:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def execute(self, statement):
        self.queries.append(str(statement))
        return FakeScalarResult()
