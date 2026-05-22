from __future__ import annotations

from pathlib import PurePosixPath

from sqlalchemy import select

from apps.api.app.domains.comic.models import ComicCharacterCard
from apps.api.app.domains.image import client_provider_rendering
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import Asset, ImageJobReferenceAsset
from apps.api.app.domains.llm.service import RenderedImage
from apps.api.app.infra.db.session import session_scope
from apps.api.app.infra.storage.factory import build_asset_storage
from apps.worker.worker import main as worker_main
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks
from apps.worker.worker.tasks import image_jobs as worker_image_jobs
from apps.api.tests.test_comic_pipeline import create_comic_client, create_task, install_llm_outputs

MAX_WORKER_RUNS = 20
WORKER_IDLE_MESSAGE = "No claimable comic tasks."


def test_comic_reference_pipeline_generates_page_with_reference_assets(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    install_llm_outputs(monkeypatch)
    monkeypatch.setattr(image_service, "render_image", fake_renderer, raising=False)
    monkeypatch.setattr(client_provider_rendering, "render_image_with_client_provider", fake_renderer, raising=False)

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
    monkeypatch.setattr(client_provider_rendering, "render_image_with_client_provider", fake_renderer, raising=False)

    run_worker_until_idle()

    results = client.get(f"/api/public/comic/tasks/{task['id']}/image-results").json()["data"]
    page_job_id = results[0]["image_job_id"]
    assert results[0]["image_status"] == "succeeded"
    assert results[0]["result"]["asset_url"]
    assert page_job_id is not None
    assert page_job_has_reference_rows(page_job_id)
    assert_comic_assets_saved_under_task_folder(task["id"], page_asset_id=results[0]["result"]["asset_id"])


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
        message = worker_main.run_once()
        run_image_worker_until_idle()
        if message == WORKER_IDLE_MESSAGE:
            return
    raise AssertionError("worker did not become idle after full comic generation")


def page_job_has_reference_rows(job_id: int) -> bool:
    with session_scope() as session:
        row_count = len(list(session.execute(select(ImageJobReferenceAsset).where(ImageJobReferenceAsset.job_id == job_id)).scalars()))
        return row_count > 0


def assert_comic_assets_saved_under_task_folder(task_id: str, *, page_asset_id: int) -> None:
    expected_root = PurePosixPath("comics") / f"River-Blade--{task_id}"
    with session_scope() as session:
        reference_asset_id = session.execute(
            select(ComicCharacterCard.reference_asset_id).where(ComicCharacterCard.task_id == task_id)
        ).scalar_one()
        reference_asset = session.get(Asset, reference_asset_id)
        page_asset = session.get(Asset, page_asset_id)

    assert reference_asset is not None
    assert page_asset is not None
    reference_key = PurePosixPath(reference_asset.storage_path)
    page_key = PurePosixPath(page_asset.storage_path)
    storage = build_asset_storage()
    assert reference_key.parent == expected_root / "references"
    assert page_key.parent == expected_root / "pages"
    assert storage.exists(reference_asset.storage_path)
    assert storage.exists(page_asset.storage_path)
