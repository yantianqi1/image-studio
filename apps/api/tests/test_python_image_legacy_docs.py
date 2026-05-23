from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def read_repo_file(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_go_runtime_cutover_docs_cover_gray_release_and_rollback() -> None:
    deploy_doc = read_repo_file("docs/deploy/go-runtime-cutover.md")
    runbook = read_repo_file("docs/runbooks/go-core-api.md")
    image_runtime_runbook = read_repo_file("docs/runbooks/image-runtime.md")
    env_example = read_repo_file(".env.example")
    nginx_readme = read_repo_file("infra/nginx/README.md")

    for expected in [
        "GO_WORKER_MODE=render",
        "GO_IMAGE_API_READS_ENABLED",
        "GO_IMAGE_API_CREATE_ENABLED",
        "GO_CORE_API_BILLING_ENABLED",
        "GO_CORE_API_QUOTA_ENABLED",
        "nginx reload",
        "rollback",
        "INTERNAL_SERVICE_TOKEN",
        "pprof",
    ]:
        assert expected in deploy_doc

    for expected in [
        "after the 24h cutover gate passes",
        "FastAPI fallback",
        "docs/runbooks/go-image-api-cutover.md",
        "public create returns queued",
        "item count matches requested_count",
        "outbox has asset/job event",
    ]:
        assert expected in image_runtime_runbook

    for expected in ["queue 堆积", "provider 熔断", "billing reconcile", "asset missing"]:
        assert expected in image_runtime_runbook

    assert "GO_IMAGE_API_READS_ENABLED=false" in env_example
    assert "GO_IMAGE_API_CREATE_ENABLED=false" in env_example
    assert "Go image API route takeover 必须显式开启" in nginx_readme

    assert "本地 wallet billing 已移除" in runbook
    assert "不要重建 wallet" in runbook


def test_python_image_execution_is_documented_as_legacy_only() -> None:
    legacy_doc = read_repo_file("docs/architecture/python-image-legacy.md")
    sunset_doc = read_repo_file("docs/architecture/fastapi-image-legacy-sunset.md")
    readme = read_repo_file("README.md")
    worker_main = read_repo_file("apps/worker/worker/main.py")
    worker_image_jobs = read_repo_file("apps/worker/worker/tasks/image_jobs.py")
    direct_rendering = read_repo_file("apps/api/app/domains/image/direct_rendering.py")
    worker_go_readme = read_repo_file("apps/worker-go/README.md")

    assert "Production image execution is owned by apps/worker-go" in legacy_doc
    assert "docs/architecture/fastapi-image-legacy-sunset.md" in legacy_doc
    assert "manual/test helper" in legacy_doc
    assert "FastAPI public image routes remain" in legacy_doc
    assert "FastAPI public image create/read routes" in sunset_doc
    assert "Fallback window: 1-2 releases" in sunset_doc
    assert "Any public create path that calls `render_job_immediately`" in sunset_doc
    assert "Delete these only after the fallback window closes" in sunset_doc
    assert "Python worker 不再调度生产 image jobs" in readme
    assert "image_job_items 由 Go worker 执行" in readme
    assert "legacy fallback" not in worker_go_readme
    assert "manual legacy repair" in worker_go_readme
    assert "Deprecated manual/test-only Python image job executor" in worker_image_jobs
    assert "Deprecated development/test-only synchronous image rendering path" in direct_rendering
    assert "image-jobs" not in worker_main
    assert "WORKER_ENABLE_IMAGE_JOBS" not in worker_main
