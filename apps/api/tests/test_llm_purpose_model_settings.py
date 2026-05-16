from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.image.title_generation import generate_image_job_title
from apps.api.app.domains.llm.catalog import ensure_provider_catalog
from apps.api.app.domains.llm.models import Provider, SellableModel
from apps.api.app.domains.llm.purpose_models import (
    LLM_PURPOSE_COMIC_CHARACTER_BIBLE,
    LLM_PURPOSE_COMIC_STORY_ANALYSIS,
    LLM_PURPOSE_COMIC_STORYBOARD,
    LLM_PURPOSE_IMAGE_JOB_TITLE,
    LLM_PURPOSE_PROMPT_CRAFTER,
    update_llm_purpose_model_codes,
)
from apps.api.app.domains.prompt_crafter import service as prompt_crafter_service
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app
from apps.api.tests.test_comic_pipeline import create_comic_client, create_task, install_llm_outputs
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks


class ChatResponse:
    status_code = 200

    def __init__(self, content: str) -> None:
        self.content = content

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self.content}}]}


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def settings_payload(**llm_codes: str) -> dict[str, object]:
    return {
        "site_title": "image Studio",
        "allow_public_signup": True,
        "allow_anonymous_image": True,
        "uploads_enabled": True,
        "client_provider_url_pool": "",
        "llm_purpose_model_codes": llm_codes,
    }


def seed_chat_model(code: str, provider_model: str) -> None:
    initialize_database()
    with session_scope() as session:
        ensure_provider_catalog(session)
        provider = session.execute(select(Provider).where(Provider.name == "wdapi")).scalar_one()
        existing = session.execute(select(SellableModel).where(SellableModel.code == code)).scalar_one_or_none()
        if existing is None:
            session.add(
                SellableModel(
                    code=code,
                    display_name=code,
                    capability="chat",
                    provider_id=provider.id,
                    provider_model=provider_model,
                    public_enabled=False,
                    member_price_cents=0,
                    anonymous_price_cents=0,
                    status="active",
                )
            )
        else:
            existing.provider_model = provider_model
            existing.capability = "chat"
            existing.status = "active"
        session.commit()


def set_purpose_model_codes(codes: dict[str, str]) -> None:
    initialize_database()
    with session_scope() as session:
        update_llm_purpose_model_codes(session, codes)
        session.commit()


def test_admin_can_configure_llm_purpose_models() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)
    seed_chat_model("title-purpose-model", "title-provider-model")
    seed_chat_model("prompt-purpose-model", "prompt-provider-model")

    response = client.patch(
        "/api/admin/settings",
        json=settings_payload(
            image_job_title="title-purpose-model",
            prompt_crafter="prompt-purpose-model",
        ),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["llm_purpose_model_codes"]["image_job_title"] == "title-purpose-model"
    assert data["llm_purpose_model_codes"]["prompt_crafter"] == "prompt-purpose-model"
    assert any(item["purpose"] == "prompt_crafter" for item in data["llm_purpose_models"])


def test_admin_rejects_non_chat_model_for_llm_purpose() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)

    response = client.patch(
        "/api/admin/settings",
        json=settings_payload(prompt_crafter="gpt-image-2"),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "llm_purpose_model_invalid"


def test_image_job_title_uses_configured_purpose_model(monkeypatch) -> None:
    seed_chat_model("title-purpose-model", "title-provider-model")
    set_purpose_model_codes({LLM_PURPOSE_IMAGE_JOB_TITLE: "title-purpose-model"})
    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    calls: list[str] = []

    def fake_post_chat_completion(*, target, payload):
        calls.append(target.provider_model)
        return ChatResponse('{"title":"蓝色城市"}')

    monkeypatch.setattr(
        "apps.api.app.domains.llm.openai_chat.post_chat_completion",
        fake_post_chat_completion,
    )

    with session_scope() as session:
        title = generate_image_job_title(session, prompt="blue city")

    assert title == "蓝色城市"
    assert calls == ["title-provider-model"]


def test_prompt_crafter_uses_configured_purpose_model(monkeypatch) -> None:
    seed_chat_model("prompt-purpose-model", "prompt-provider-model")
    set_purpose_model_codes({LLM_PURPOSE_PROMPT_CRAFTER: "prompt-purpose-model"})
    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    calls: list[str] = []

    def fake_stream_chat_completion(*, target, payload):
        calls.append(target.provider_model)
        yield "ok"

    monkeypatch.setattr(
        prompt_crafter_service.openai_chat_stream,
        "stream_chat_completion",
        fake_stream_chat_completion,
    )

    with session_scope() as session:
        events = list(
            prompt_crafter_service.stream_prompt_crafter_sse_completion(
                session,
                messages=[{"role": "user", "content": "做一个海报提示词"}],
            )
        )

    assert calls == ["prompt-provider-model"]
    assert any("ok" in event for event in events)


def test_comic_pipeline_uses_configured_stage_models(monkeypatch) -> None:
    seed_chat_model("story-analysis-model", "story-analysis-provider")
    seed_chat_model("character-bible-model", "character-bible-provider")
    seed_chat_model("storyboard-model", "storyboard-provider")
    set_purpose_model_codes(
        {
            LLM_PURPOSE_COMIC_STORY_ANALYSIS: "story-analysis-model",
            LLM_PURPOSE_COMIC_CHARACTER_BIBLE: "character-bible-model",
            LLM_PURPOSE_COMIC_STORYBOARD: "storyboard-model",
        }
    )
    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    client = create_comic_client()
    task = create_task(client, include_client_provider=False)
    calls = install_llm_outputs(monkeypatch)

    processed_task_id = worker_comic_tasks.run_next_comic_task()

    assert processed_task_id == task["id"]
    assert {
        call["schema_name"]: call["chat_target"].provider_model
        for call in calls
    } == {
        "StoryAnalysis": "story-analysis-provider",
        "CharacterBible": "character-bible-provider",
        "Storyboard": "storyboard-provider",
    }
