from __future__ import annotations

import base64
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.core.errors import AppError
from apps.api.app.domains.image import service as image_service
from apps.api.app.domains.image.models import ImageAssetTag, ImageAssetTaggingJob, ImageJob
from apps.api.app.domains.image.tagging_llm import normalize_generated_tags
from apps.api.app.domains.llm.service import RenderedImage
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app
from apps.worker.worker.tasks import gallery_tagging as worker_gallery_tagging
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


@dataclass
class FakeChatResponse:
    content: str
    status_code: int = 200

    @property
    def headers(self) -> dict[str, str]:
        return {"x-request-id": "req-gallery-tags"}

    @property
    def text(self) -> str:
        return self.content

    def json(self) -> dict[str, object]:
        return {"choices": [{"message": {"content": self.content}}]}


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def register_user(client: TestClient, email: str = "gallery-tags@example.com") -> None:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201


def rendered_png(_session=None, *, prompt: str, **_kwargs) -> RenderedImage:
    return RenderedImage(
        content=VALID_PNG_BYTES,
        mime_type="image/png",
        revised_prompt=f"revised:{prompt}",
        provider_request_id="gallery-tag-render",
    )


def create_image(client: TestClient, *, prompt: str, visibility: str = "public") -> dict[str, object]:
    response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": prompt,
            "model_code": "gpt-image-2",
            "requested_count": 1,
            "visibility": visibility,
        },
    )
    assert response.status_code == 201
    job = response.json()["data"]
    assert worker_image_jobs.run_next_image_job() == job["id"]
    results = client.get(f"/api/public/image/jobs/{job['id']}/results").json()["data"]
    return results[0]


def gallery_items(client: TestClient, scope: str, *, tag: str | None = None) -> list[dict[str, object]]:
    suffix = f"&tag={tag}" if tag else ""
    response = client.get(f"/api/public/image/gallery?scope={scope}{suffix}")
    assert response.status_code == 200
    return response.json()["data"]


def test_gallery_tagging_worker_generates_tags_and_gallery_filter(monkeypatch) -> None:
    captured_requests: list[dict[str, object]] = []

    def fake_post(url: str, *, headers, json, timeout: float):
        captured_requests.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeChatResponse('{"tags":["霓虹街道","夜景","电影感"]}')

    monkeypatch.setattr(image_service, "render_image", rendered_png, raising=False)
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.httpx.post", fake_post)
    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_CODE", "gallery-model")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_PROVIDER_MODEL", "gallery-provider-model")
    client = build_client()
    register_user(client)

    result = create_image(client, prompt="霓虹雨夜街头，电影感镜头")
    processed_tagging_job_id = worker_gallery_tagging.run_next_gallery_tagging_job()

    items = gallery_items(client, "mine")
    public_items = gallery_items(client, "public", tag="霓虹街道")
    unmatched_items = gallery_items(client, "public", tag="水彩")

    assert processed_tagging_job_id is not None
    assert items[0]["asset_id"] == result["asset_id"]
    assert items[0]["tags"] == ["霓虹街道", "夜景", "电影感"]
    assert items[0]["tagging_status"] == "succeeded"
    assert public_items[0]["asset_id"] == result["asset_id"]
    assert unmatched_items == []
    assert captured_requests[0]["json"]["model"] == "gallery-provider-model"
    assert "最多 6 个" in captured_requests[0]["json"]["messages"][0]["content"]
    user_content = captured_requests[0]["json"]["messages"][1]["content"]
    assert user_content[0]["text"].startswith("请为这张图库图片生成")
    assert any(part.get("type") == "image_url" for part in user_content)
    with session_scope() as session:
        tags = list(session.execute(select(ImageAssetTag).where(ImageAssetTag.asset_id == result["asset_id"])).scalars())
        assert [tag.tag for tag in tags] == ["霓虹街道", "夜景", "电影感"]


def test_gallery_tagging_failure_does_not_fail_image_job(monkeypatch) -> None:
    monkeypatch.setattr(image_service, "render_image", rendered_png, raising=False)
    monkeypatch.setattr(
        "apps.api.app.domains.llm.openai_chat.httpx.post",
        lambda *args, **kwargs: FakeChatResponse('{"tags":[]}'),
    )
    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_CODE", "gallery-model")
    monkeypatch.setenv("OPENAI_CHAT_MODEL_PROVIDER_MODEL", "gallery-provider-model")
    client = build_client()
    register_user(client, "gallery-tags-failure@example.com")

    result = create_image(client, prompt="留白产品图")
    processed_tagging_job_id = worker_gallery_tagging.run_next_gallery_tagging_job()
    item = gallery_items(client, "mine")[0]

    assert processed_tagging_job_id is not None
    assert item["asset_id"] == result["asset_id"]
    assert item["tags"] == []
    assert item["tagging_status"] == "failed"
    with session_scope() as session:
        image_job = session.get(ImageJob, result["job_id"])
        tagging_job = session.get(ImageAssetTaggingJob, processed_tagging_job_id)
        assert image_job.status == "succeeded"
        assert tagging_job.status == "failed"
        assert tagging_job.error_code == "image_asset_tagging_empty"


def test_normalize_generated_tags_rejects_too_many_tags() -> None:
    with pytest.raises(AppError, match="too many gallery tags"):
        normalize_generated_tags(["一", "二", "三", "四", "五", "六", "七"])


def test_normalize_generated_tags_rejects_duplicate_tags() -> None:
    with pytest.raises(AppError, match="duplicate gallery tag"):
        normalize_generated_tags(["霓虹街道", "霓虹街道"])


def test_normalize_generated_tags_rejects_too_long_tag() -> None:
    with pytest.raises(AppError, match="gallery tag too long"):
        normalize_generated_tags(["这是一个长度明显超过二十四个字符限制的图库自动生成标签"])
