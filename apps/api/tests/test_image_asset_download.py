from __future__ import annotations

from apps.api.app.domains.image import service as image_service
from apps.api.tests.test_image_jobs import build_client, build_rendered_image_from_job, create_image_job
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


def test_public_image_asset_download_returns_source_file_with_attachment(monkeypatch) -> None:
    monkeypatch.setattr(image_service, "render_image", build_rendered_image_from_job, raising=False)
    client = build_client()
    job = create_image_job(client, prompt="Download original source")

    processed_job_id = worker_image_jobs.run_next_image_job()
    results_response = client.get(f"/api/public/image/jobs/{job['id']}/results")
    asset_id = results_response.json()["data"][0]["asset_id"]
    download_response = client.get(f"/api/public/image/assets/{asset_id}/download")

    assert processed_job_id == job["id"]
    assert download_response.status_code == 200
    assert download_response.headers["content-type"].startswith("image/svg+xml")
    assert download_response.headers["content-disposition"] == (
        f'attachment; filename="generated-image-{asset_id}.svg"'
    )
    assert b"Download original source:gpt-image-2" in download_response.content
