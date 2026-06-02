from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SMOKE_SCRIPT = ROOT / "scripts/server-real-test-smoke.sh"
README = ROOT / "README.md"
ENV_EXAMPLE = ROOT / ".env.example"


def test_server_real_test_smoke_checks_go_runtime_and_public_model() -> None:
    source = SMOKE_SCRIPT.read_text()

    assert "worker-go" in source
    assert "image-api-go" in source
    assert "http://127.0.0.1:7900/readyz" in source
    assert "http://127.0.0.1:7900/metrics" in source
    assert "http://127.0.0.1:7810/readyz" in source
    assert "/api/public/models" in source
    assert 'model.capability === "image"' in source
    assert "No public image model is available" in source
    assert "REQUIRE_IMAGE_MODEL" not in source


def test_readme_points_server_deploy_to_real_test_smoke() -> None:
    source = README.read_text()

    assert "scripts/server-real-test-smoke.sh" in source
    assert "worker-go" in source
    assert "Python worker 不再调度生产 image jobs" in source


def test_env_example_exposes_go_worker_http_diagnostics() -> None:
    source = ENV_EXAMPLE.read_text()

    assert "GO_WORKER_ENABLE_HTTP=true" in source
    assert "GO_WORKER_HTTP_ADDR=:7900" in source
