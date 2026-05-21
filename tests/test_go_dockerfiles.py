from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_worker_go_dockerfile_copies_runtime_module_for_replace_path() -> None:
    source = (ROOT / "docker/worker-go.Dockerfile").read_text()

    assert "apps/image-runtime-go" in source
    assert "WORKDIR /src/apps/worker-go" in source
