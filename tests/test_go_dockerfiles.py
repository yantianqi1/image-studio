from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "docker-compose.yml"
DEPLOY_SCRIPT = ROOT / "scripts/deploy-prod.sh"
IMAGE_RUNTIME_RUNBOOK = ROOT / "docs/runbooks/image-runtime.md"


def test_worker_go_dockerfile_copies_runtime_module_for_replace_path() -> None:
    source = (ROOT / "docker/worker-go.Dockerfile").read_text()

    assert "apps/image-runtime-go" in source
    assert "WORKDIR /src/apps/worker-go" in source
    assert "apk add --no-cache ca-certificates" in source


def test_worker_go_runs_by_default_in_render_mode() -> None:
    source = COMPOSE_FILE.read_text()
    service = service_block(source, "worker-go")

    assert "profiles:" not in service
    assert "GO_WORKER_MODE: ${GO_WORKER_MODE:-render}" in service
    assert "ASSET_STORAGE_GCS_BUCKET: ${ASSET_STORAGE_GCS_BUCKET:-}" in service
    assert "ASSET_STORAGE_GCS_PREFIX: ${ASSET_STORAGE_GCS_PREFIX:-generated-assets}" in service
    assert "GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS:-}" in service
    assert "${GCS_CREDENTIALS_FILE:-/dev/null}:/app/gcs-credentials.json:ro" in service


def test_python_worker_compose_does_not_expose_image_jobs_branch() -> None:
    source = COMPOSE_FILE.read_text()
    service = service_block(source, "worker")

    assert "WORKER_ENABLE_IMAGE_JOBS" not in service


def test_image_api_go_supports_gcs_asset_storage() -> None:
    source = COMPOSE_FILE.read_text()
    service = service_block(source, "image-api-go")

    assert "ASSET_STORAGE_GCS_BUCKET: ${ASSET_STORAGE_GCS_BUCKET:-}" in service
    assert "ASSET_STORAGE_GCS_PREFIX: ${ASSET_STORAGE_GCS_PREFIX:-generated-assets}" in service
    assert "GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS:-}" in service
    assert "${GCS_CREDENTIALS_FILE:-/dev/null}:/app/gcs-credentials.json:ro" in service


def test_deploy_script_restarts_worker_go() -> None:
    source = DEPLOY_SCRIPT.read_text()

    assert "docker compose up -d --no-deps worker-go" in source
    assert "http://127.0.0.1:7900/readyz" in source


def test_image_runtime_runbook_covers_phase_10_operations() -> None:
    source = IMAGE_RUNTIME_RUNBOOK.read_text()

    for text in [
        "queue_wait_p95 > 120s",
        "failed_rate > 10%",
        "dead_letter_count > 0",
        "provider_circuit_open",
        "worker_heartbeat_failed",
        "asset_write_failed",
        "billing_reconcile_failed",
        "队列堆积",
        "provider 熔断",
        "大量 failed",
        "asset 文件缺失",
        "DB migration",
        "Postgres backup",
        "generated-assets backup",
        "GCS bucket lifecycle",
        "asset verify",
        "billing reconcile",
        "压测基线",
    ]:
        assert text in source


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
