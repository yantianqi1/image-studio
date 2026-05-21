from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "docker-compose.yml"
DEPLOY_SCRIPT = ROOT / "scripts/deploy-prod.sh"


def test_worker_go_dockerfile_copies_runtime_module_for_replace_path() -> None:
    source = (ROOT / "docker/worker-go.Dockerfile").read_text()

    assert "apps/image-runtime-go" in source
    assert "WORKDIR /src/apps/worker-go" in source


def test_worker_go_runs_by_default_in_render_mode() -> None:
    source = COMPOSE_FILE.read_text()
    service = service_block(source, "worker-go")

    assert "profiles:" not in service
    assert "GO_WORKER_MODE: ${GO_WORKER_MODE:-render}" in service


def test_deploy_script_restarts_worker_go() -> None:
    source = DEPLOY_SCRIPT.read_text()

    assert "docker compose up -d --no-deps worker-go" in source
    assert "http://127.0.0.1:7900/readyz" in source


def service_block(source: str, service_name: str) -> str:
    marker = f"\n  {service_name}:\n"
    start = source.index(marker)
    lines = source[start + len(marker):].splitlines()
    block: list[str] = []
    for line in lines:
        if line.startswith("  ") and not line.startswith("    "):
            break
        block.append(line)
    return "\n".join(block)
