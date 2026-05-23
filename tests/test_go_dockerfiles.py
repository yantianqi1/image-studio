from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "docker-compose.yml"
DEPLOY_SCRIPT = ROOT / "scripts/deploy-prod.sh"
IMAGE_RUNTIME_RUNBOOK = ROOT / "docs/runbooks/image-runtime.md"
GO_IMAGE_API_CUTOVER_RUNBOOK = ROOT / "docs/runbooks/go-image-api-cutover.md"
PHASE8_CHECKPOINT_RUNBOOK = ROOT / "docs/runbooks/go-image-api-phase8-checkpoint.md"
ADMIN_IMAGE_STATS_PANEL = ROOT / "apps/admin-web/src/features/jobs/image-job-stats.tsx"
CUTOVER_CHECK_SCRIPT = ROOT / "scripts/check-go-image-api-cutover.py"
CUTOVER_COLLECT_SCRIPT = ROOT / "scripts/collect-go-image-api-cutover-evidence.sh"


def test_worker_go_dockerfile_copies_runtime_module_for_replace_path() -> None:
    source = (ROOT / "docker/worker-go.Dockerfile").read_text()

    assert "apps/image-runtime-go" in source
    assert "WORKDIR /src/apps/worker-go" in source
    assert "go build -trimpath -ldflags=\"-s -w\" -o /app/assetctl ./cmd/assetctl" in source
    assert "COPY --from=builder /app/assetctl /app/assetctl" in source
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

    assert "profiles:" not in service
    assert "GO_IMAGE_API_CREATE_ENABLED: ${GO_IMAGE_API_CREATE_ENABLED:-false}" in service
    assert "ASSET_STORAGE_GCS_BUCKET: ${ASSET_STORAGE_GCS_BUCKET:-}" in service
    assert "ASSET_STORAGE_GCS_PREFIX: ${ASSET_STORAGE_GCS_PREFIX:-generated-assets}" in service
    assert "GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS:-}" in service
    assert "${GCS_CREDENTIALS_FILE:-/dev/null}:/app/gcs-credentials.json:ro" in service


def test_nginx_keeps_go_image_api_cutover_flags_explicit_with_fastapi_default() -> None:
    source = COMPOSE_FILE.read_text()
    service = service_block(source, "nginx")

    assert "GO_IMAGE_API_READS_ENABLED: ${GO_IMAGE_API_READS_ENABLED:-false}" in service
    assert "GO_IMAGE_API_ASSETS_ENABLED: ${GO_IMAGE_API_ASSETS_ENABLED:-false}" in service
    assert "GO_IMAGE_API_SSE_ENABLED: ${GO_IMAGE_API_SSE_ENABLED:-false}" in service
    assert "GO_IMAGE_API_CREATE_ENABLED: ${GO_IMAGE_API_CREATE_ENABLED:-false}" in service
    assert "image-api-go:" in service


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


def test_go_image_api_cutover_runbook_defines_slo_and_metric_gaps() -> None:
    source = GO_IMAGE_API_CUTOVER_RUNBOOK.read_text()

    for text in [
        "scripts/check-go-image-api-cutover.py",
        "scripts/collect-go-image-api-cutover-evidence.sh",
        "manifest.json",
        "checker exit code",
        "sha256",
        "cutover_decision",
        "go_image_api_read_default_allowed=true",
        "go_image_api_create_default_allowed=true",
        "Only set `GO_IMAGE_API_CREATE_ENABLED=true` when",
        "For partial read-default decisions, keep `GO_IMAGE_API_CREATE_ENABLED=false`",
        "ROLLBACK_DRILL_EVIDENCE_FILE",
        "--rollback-drill-evidence-file",
        "rollback_drill_passed=true",
        "preflight.txt",
        "--nginx-access-log",
        "--worker-metrics-file",
        "--asset-verify-output-file",
        "at least 1 image item in the observation window",
        "create 5xx rate < 0.5%",
        "create route proof",
        "Missing nginx access logs block",
        "Missing asset",
        'route_upstream="http://image-api-go:7810"',
        "non-Go or missing route evidence blocks promotion",
        "image item terminal failure rate < 3%",
        "provider failure rate < 3%",
        "queue wait p95 < 120s",
        "render duration p95",
        "outbox pending oldest age < 60s",
        "dead letter count",
        "worker heartbeat failed",
        "asset missing count = 0",
        "asset mismatched count = 0",
        "切流后 15 分钟",
        "切流后 24 小时",
    ]:
        assert text in source
    assert "TODO: create 5xx rate" not in source
    assert "TODO: asset missing count" not in source


def test_admin_stats_panel_exposes_available_cutover_metrics() -> None:
    source = ADMIN_IMAGE_STATS_PANEL.read_text()

    for text in ["队列 p95", "渲染 p95", "死信单元", "供应商熔断", "事件积压"]:
        assert text in source


def test_phase8_docs_keep_go_image_api_cutover_gate_before_default_path() -> None:
    docs = [
        ROOT / "docs/deploy/go-runtime-cutover.md",
        ROOT / "docs/deploy/go-worker-cutover.md",
        ROOT / "docs/go-image-api-shadow.md",
        ROOT / "docs/runbooks/go-core-api.md",
        PHASE8_CHECKPOINT_RUNBOOK,
    ]
    source = "\n".join(path.read_text() for path in docs)

    assert "--profile image-api-go" not in source
    assert "--profile worker-go" not in source
    assert "not a default production public entrypoint" not in source
    assert "Nginx keeps public image creation on FastAPI by default" not in source
    assert "24h" in source
    assert "GO_IMAGE_API_CREATE_ENABLED=false" in source
    assert "GO_IMAGE_API_CREATE_ENABLED=true" in source
    assert "stabilize go image api create cutover path" in source
    assert "scripts/check-go-image-api-cutover.py" in source
    assert CUTOVER_CHECK_SCRIPT.exists()
    assert "scripts/collect-go-image-api-cutover-evidence.sh" in source
    assert CUTOVER_COLLECT_SCRIPT.exists()
    assert "Missing metrics remain explicit TODOs" not in source


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
