from __future__ import annotations

from sqlalchemy import select

from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageJobReferenceAsset
from apps.api.app.domains.llm.service import RenderedImage
from apps.api.app.infra.db.session import session_scope
from apps.worker.worker import main as worker_main
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks
from apps.worker.worker.tasks import image_jobs as worker_image_jobs
from apps.api.tests.test_comic_pipeline import create_comic_client, create_task, install_llm_outputs

MAX_WORKER_RUNS = 20
WORKER_IDLE_MESSAGE = "No claimable comic tasks or image jobs."


def test_comic_reference_pipeline_generates_page_with_reference_assets(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    install_llm_outputs(monkeypatch)
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    monkeypatch.setattr(image_service, "render_image_with_client_provider", fake_renderer, raising=False)

    worker_comic_tasks.run_next_comic_task()
    reference_response = client.post(f"/api/public/comic/tasks/{task['id']}/character-references")
    run_image_worker_until_idle()
    sync_response = client.post(f"/api/public/comic/tasks/{task['id']}/character-references/sync")
    page_response = client.post(f"/api/public/comic/tasks/{task['id']}/approve-and-generate-images")
    page_job_id = page_response.json()["data"]["prompts"][0]["image_job_id"]
    run_image_worker_until_idle()
    results_response = client.get(f"/api/public/comic/tasks/{task['id']}/image-results")

    assert reference_response.status_code == 201
    assert sync_response.json()["data"]["ready"] is True
    assert page_response.status_code == 201
    assert page_job_has_reference_rows(page_job_id)
    assert results_response.json()["data"][0]["image_status"] == "succeeded"
    assert results_response.json()["data"][0]["result"]["asset_url"]


def test_worker_persists_full_comic_generation_without_frontend_approval(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    install_llm_outputs(monkeypatch)
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    monkeypatch.setattr(image_service, "render_image_with_client_provider", fake_renderer, raising=False)

    run_worker_until_idle()

    results = client.get(f"/api/public/comic/tasks/{task['id']}/image-results").json()["data"]
    page_job_id = results[0]["image_job_id"]
    assert results[0]["image_status"] == "succeeded"
    assert results[0]["result"]["asset_url"]
    assert page_job_id is not None
    assert page_job_has_reference_rows(page_job_id)


def fake_renderer(_session=None, **kwargs) -> RenderedImage:
    reference_text = ",".join(str(item) for item in kwargs.get("reference_asset_ids", []))
    prompt = f"{kwargs['prompt']} refs={reference_text}"
    return RenderedImage(
        content=f"<svg><text>{prompt}</text></svg>".encode("utf-8"),
        mime_type="image/svg+xml",
        revised_prompt=prompt,
        provider_request_id="comic-reference-e2e",
    )


def run_image_worker_until_idle() -> None:
    while worker_image_jobs.run_next_image_job() is not None:
        continue


def run_worker_until_idle() -> None:
    for _ in range(MAX_WORKER_RUNS):
        if worker_main.run_once() == WORKER_IDLE_MESSAGE:
            return
    raise AssertionError("worker did not become idle after full comic generation")


def page_job_has_reference_rows(job_id: int) -> bool:
    with session_scope() as session:
        row_count = len(list(session.execute(select(ImageJobReferenceAsset).where(ImageJobReferenceAsset.job_id == job_id)).scalars()))
        return row_count > 0
