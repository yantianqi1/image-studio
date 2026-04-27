from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from apps.api.app.domains.auth.service import create_user
from apps.api.app.domains.billing.service import create_wallet
from apps.api.app.domains.comic.models import ComicCharacterCard, ComicPanelPrompt, ComicStoryboard, ComicTask
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobReferenceAsset, ImageJobResult
from apps.api.app.domains.public_quota.constants import PUBLIC_QUOTA_MODE_PER_IP
from apps.api.app.domains.public_quota.service import get_public_quota_status
from apps.api.app.domains.settings.service import get_settings_record
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app
from apps.worker.worker.tasks import comic_orchestration as worker_comic_orchestration
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks

PUBLIC_QUOTA_REQUEST_IP = "203.0.113.41"


def test_approve_does_not_render_images_synchronously(monkeypatch) -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=2)
    install_render_sentinel(monkeypatch)

    response = approve_task(client, task["id"])

    assert response["created_count"] == 2
    assert response["reused_count"] == 0
    assert count_image_jobs() == 2


def test_approve_creates_one_image_job_per_panel_prompt() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=3, reference_ready=True)

    response = approve_task(client, task["id"])

    assert response["created_count"] == 3
    assert len(response["prompts"]) == 3
    assert [item["prompt"] for item in response["prompts"]] == ["Panel prompt 1", "Panel prompt 2", "Panel prompt 3"]
    assert all(item["image_job_id"] for item in response["prompts"])
    assert sorted(job_prompts()) == ["Panel prompt 1", "Panel prompt 2", "Panel prompt 3"]
    assert all_page_jobs_have_reference_rows()


def test_page_generation_requires_character_references() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=1, reference_ready=False)

    response = client.post(f"/api/public/comic/tasks/{task['id']}/approve-and-generate-images")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "comic_character_references_not_ready"


def test_approve_is_idempotent() -> None:
    client = build_client()
    use_per_ip_public_quota()
    task = seed_completed_task(
        client,
        prompt_count=2,
        include_client_provider=False,
        request_headers=public_quota_headers(),
    )

    first = approve_task(client, task["id"])
    quota_after_first = public_quota_used_count()
    second = approve_task(client, task["id"])
    quota_after_second = public_quota_used_count()

    assert first["created_count"] == 2
    assert second["created_count"] == 0
    assert second["reused_count"] == 2
    assert prompt_job_ids(second) == prompt_job_ids(first)
    assert count_image_jobs() == 2
    assert quota_after_first == 2
    assert quota_after_second == 2


def test_approve_replaces_failed_page_jobs() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=1)
    first = approve_task(client, task["id"])
    mark_prompt_job_failed(first["prompts"][0]["image_job_id"])

    second = approve_task(client, task["id"])

    assert second["created_count"] == 1
    assert second["reused_count"] == 0
    assert prompt_job_ids(second) != prompt_job_ids(first)
    assert all_page_jobs_have_reference_rows()


def test_approve_replaces_jobs_without_reference_rows() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=1)
    first = approve_task(client, task["id"])
    delete_reference_rows(first["prompts"][0]["image_job_id"])

    second = approve_task(client, task["id"])

    assert second["created_count"] == 1
    assert second["reused_count"] == 0
    assert prompt_job_ids(second) != prompt_job_ids(first)
    assert all_page_jobs_have_reference_rows()


def test_approve_fails_when_prompts_are_not_ready() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=0)

    response = client.post(f"/api/public/comic/tasks/{task['id']}/approve-and-generate-images")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "comic_prompts_not_ready"


def test_approve_fails_when_task_is_not_completed() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=1, status="running")


    response = client.post(f"/api/public/comic/tasks/{task['id']}/approve-and-generate-images")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "comic_task_not_ready"


def test_regenerate_image_replaces_prompt_job_without_rendering(monkeypatch) -> None:
    client = build_client()
    use_per_ip_public_quota()
    task = seed_completed_task(
        client,
        prompt_count=1,
        include_client_provider=False,
        request_headers=public_quota_headers(),
    )
    first_job_id = approve_task(client, task["id"])["prompts"][0]["image_job_id"]
    quota_after_first_approve = public_quota_used_count()
    prompt_id = first_prompt_id(task["id"])
    install_render_sentinel(monkeypatch)

    response = client.post(f"/api/public/comic/panel-prompts/{prompt_id}/regenerate-image")
    quota_after_regenerate = public_quota_used_count()


    assert response.status_code == 201
    data = response.json()["data"]
    assert data["image_job_id"] != first_job_id
    assert first_job_id in image_job_ids()
    assert current_prompt_job_id(prompt_id) == data["image_job_id"]
    assert quota_after_first_approve == 1
    assert quota_after_regenerate == 2


def test_image_results_reports_prompt_image_statuses() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=3)
    prompt_ids = [item["id"] for item in approve_task(client, task["id"])["prompts"]]
    seed_job_states(prompt_ids)

    response = client.get(f"/api/public/comic/tasks/{task['id']}/image-results")

    results = response.json()["data"]

    assert response.status_code == 200
    assert [item["image_status"] for item in results] == ["queued", "succeeded", "failed"]
    assert [item["prompt"] for item in results] == ["Panel prompt 1", "Panel prompt 2", "Panel prompt 3"]
    assert results[1]["result"]["asset_id"] is not None
    assert results[2]["error_message"] == "provider rejected"


def test_pipeline_completion_does_not_create_image_jobs(monkeypatch) -> None:
    client = build_client()
    task = create_task(client)
    install_llm_outputs(monkeypatch)

    worker_comic_tasks.run_next_comic_task()

    assert task["id"]
    assert count_image_jobs() == 0


def test_orchestration_marks_ownerless_completed_task_failed() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=1)
    clear_task_owner(task["id"])

    action = worker_comic_orchestration.run_next_comic_orchestration()

    assert action == f"failed-owner-missing:{task['id']}"
    detail = read_comic_task(task["id"])
    assert detail.status == "failed"
    assert detail.error_code == "comic_task_owner_missing"
    assert detail.error_message == "comic task owner is missing"


def test_orchestration_marks_app_error_failed_without_crashing() -> None:
    client = build_client()
    task = seed_completed_task(client, prompt_count=1, reference_ready=False)
    assign_task_owner_without_balance(task["id"])

    action = worker_comic_orchestration.run_next_comic_orchestration()

    assert action == f"failed-app-error:{task['id']}"
    detail = read_comic_task(task["id"])
    assert detail.status == "failed"
    assert detail.error_code == "balance_not_enough"
    assert detail.error_message == "insufficient balance"


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def approve_task(client: TestClient, task_id: str) -> dict:
    response = client.post(f"/api/public/comic/tasks/{task_id}/approve-and-generate-images")
    assert response.status_code == 201
    return response.json()["data"]


def seed_completed_task(
    client: TestClient,
    *,
    prompt_count: int,
    status: str = "completed",
    reference_ready: bool = True,
    request_headers: dict[str, str] | None = None,
    include_client_provider: bool = True,
) -> dict:
    task = create_task(client, headers=request_headers, include_client_provider=include_client_provider)
    with session_scope() as session:
        task_model = session.get(ComicTask, task["id"])
        task_model.status = status
        task_model.stage = status
        task_model.finished_at = datetime.utcnow() if status == "completed" else None
        storyboard = ComicStoryboard(project_id=task_model.project_id, task_id=task_model.id, style_preset="baimiao", panels_per_image=3, target_image_count=prompt_count, payload={"images": []})
        session.add(storyboard)
        session.flush()
        seed_character_card(session, task_model=task_model, reference_ready=reference_ready)
        for index in range(1, prompt_count + 1):
            session.add(build_prompt(task_model=task_model, storyboard_id=storyboard.id, index=index))
        session.commit()
    return task


def clear_task_owner(task_id: str) -> None:
    with session_scope() as session:
        task_model = session.get(ComicTask, task_id)
        task_model.user_id = None
        task_model.anonymous_session_id = None
        session.commit()


def assign_task_owner_without_balance(task_id: str) -> None:
    with session_scope() as session:
        user = create_user(session, email="no-balance-worker@example.com", password="secret")
        wallet = create_wallet(session, user_id=user.id)
        wallet.balance_cents = 0
        task_model = session.get(ComicTask, task_id)
        task_model.user_id = user.id
        task_model.anonymous_session_id = None
        task_model.client_provider_config = None
        session.commit()


def read_comic_task(task_id: str) -> ComicTask:
    with session_scope() as session:
        task_model = session.get(ComicTask, task_id)
        assert task_model is not None
        return task_model


def build_prompt(*, task_model: ComicTask, storyboard_id: int, index: int) -> ComicPanelPrompt:
    return ComicPanelPrompt(project_id=task_model.project_id, task_id=task_model.id, storyboard_id=storyboard_id, image_index=index, panel_count=3, character_codes=["hero"], prompt=f"Panel prompt {index}", negative_prompt="low quality", model_code="gpt-image-2", status="prompt_ready")


def seed_character_card(session, *, task_model: ComicTask, reference_ready: bool) -> None:
    asset_id = None
    if reference_ready:
        asset = Asset(
            owner_user_id=task_model.user_id,
            owner_anonymous_session_id=task_model.anonymous_session_id,
            storage_path="/tmp/hero-reference.png",
            mime_type="image/png",
        )
        session.add(asset)
        session.flush()
        asset_id = asset.id
    session.add(
        ComicCharacterCard(
            project_id=task_model.project_id,
            task_id=task_model.id,
            character_code="hero",
            name="Hero",
            role_in_story="lead",
            personality="focused",
            appearance={"hair": "black"},
            costume={"coat": "blue"},
            color_palette=["blue"],
            must_keep_prompt="Hero has black hair and a blue coat.",
            negative_prompt="do not change hero",
            multi_view_prompt="Hero reference sheet.",
            reference_asset_id=asset_id,
        )
    )


def create_task(
    client: TestClient,
    *,
    headers: dict[str, str] | None = None,
    include_client_provider: bool = True,
) -> dict:
    project_id = create_project(client)
    client.put(f"/api/public/comic/projects/{project_id}/chapters/chapter-001", json={"title": "Crossing", "summary": "River crossing", "sequence": 1})
    client.put(f"/api/public/comic/projects/{project_id}/chapters/chapter-001/scenes/scene-001", json={"title": "Ferry", "summary": "Ferry scene", "sequence": 1, "shots": ["wide"]})
    request_headers = client_provider_headers() if include_client_provider else {}
    if headers:
        request_headers.update(headers)
    response = client.post(
        "/api/public/comic/tasks",
        headers=request_headers,
        json={"project_id": project_id, "chapter_id": "chapter-001", "scene_id": "scene-001", "task_type": "scene-render", "input_payload": build_input_payload()},
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_project(client: TestClient) -> str:
    response = client.post(
        "/api/public/comic/projects",
        headers=client_provider_headers(),
        json={"title": "River Blade", "description": "Fixture", "genre": "Wuxia"},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def client_provider_headers() -> dict[str, str]:
    return {
        "x-client-id": "comic-image-client",
        "x-client-provider-base-url": "https://comic-image.example/v1",
        "x-client-provider-api-key": "sk-comic-image",
    }


def public_quota_headers() -> dict[str, str]:
    return {"x-forwarded-for": PUBLIC_QUOTA_REQUEST_IP}


def public_quota_used_count() -> int:
    with session_scope() as session:
        status = get_public_quota_status(session, request_ip=PUBLIC_QUOTA_REQUEST_IP)
        return int(status["used_count"])


def use_per_ip_public_quota() -> None:
    with session_scope() as session:
        record = get_settings_record(session)
        record.public_quota_mode = PUBLIC_QUOTA_MODE_PER_IP
        record.public_quota_per_ip_limit = 5


def build_input_payload() -> dict:
    return {"source_type": "text", "source_text": "Lin reaches a haunted ferry.", "style_preset": "baimiao", "panels_per_image": 3, "target_image_count": 1}


def install_render_sentinel(monkeypatch) -> None:
    def fail_render(*args, **kwargs):
        raise AssertionError("provider or worker must not run during comic image enqueue")

    monkeypatch.setattr("apps.api.app.domains.llm.service.render_image", fail_render)
    monkeypatch.setattr("apps.api.app.domains.image.service.process_claimed_job", fail_render)


def install_llm_outputs(monkeypatch) -> None:
    outputs = {"StoryAnalysis": story_analysis(), "CharacterBible": character_bible(), "Storyboard": storyboard()}

    def fake_generate(*args, **kwargs) -> dict:
        return outputs[kwargs["schema_name"]]

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.generate_structured_chat", fake_generate)


def story_analysis() -> dict:
    return {"title_suggestion": "River Blade", "genre": "wuxia", "tone": "solemn", "plot_summary": "Lin crosses a haunted river.", "world_setting": {"place": "misty ferry"}, "main_conflict": "duty versus mercy", "narrative_beats": [{"beat_index": 1, "summary": "Lin reaches the ferry.", "characters": ["hero"], "visual_potential": "fog", "emotional_intensity": 7}], "key_conflicts": ["duty versus mercy"], "visual_motifs": ["red lantern"], "missing_information": []}


def character_bible() -> dict:
    return {"characters": [{"character_code": "hero", "name": "Lin", "role_in_story": "protagonist", "personality": "disciplined", "appearance": {"hair": "black"}, "costume": {"robe": "martial robe"}, "color_palette": ["ink"], "must_keep_prompt": "black ponytail", "negative_prompt": "changed hair", "multi_view_prompt": "front side back"}]}


def storyboard() -> dict:
    panel = {"scene_description": "Lantern ferry", "characters": ["hero"], "camera": "medium", "composition": "river behind", "emotion": "focused", "dialogue": "", "sfx": "", "continuity_notes": "lantern left"}
    return {"style_preset": "baimiao", "panels_per_image": 3, "images": [{"image_index": 1, "page_purpose": "setup", "panels": [{"panel_index": index, **panel} for index in range(1, 4)]}]}


def seed_job_states(prompt_ids: list[int]) -> None:
    with session_scope() as session:
        prompts = [session.get(ComicPanelPrompt, prompt_id) for prompt_id in prompt_ids]
        for status, prompt in zip(["queued", "succeeded", "failed"], prompts, strict=True):
            job = session.get(ImageJob, prompt.image_job_id)
            job.status = status
            job.error_message = "provider rejected" if status == "failed" else None
            if status == "succeeded":
                asset = Asset(
                    owner_user_id=job.user_id,
                    owner_anonymous_session_id=job.anonymous_session_id,
                    storage_path="/tmp/comic-result.svg",
                    mime_type="image/svg+xml",
                )
                session.add(asset)
                session.flush()
                prompt.asset_id = asset.id
                session.add(ImageJobResult(job_id=job.id, result_index=1, asset_id=asset.id, asset_url=f"/api/public/image/assets/{asset.id}", revised_prompt="done", provider_request_id="req-1"))
        session.commit()


def prompt_job_ids(payload: dict) -> list[int]:
    return [item["image_job_id"] for item in payload["prompts"]]


def first_prompt_id(task_id: str) -> int:
    with session_scope() as session:
        return session.execute(select(ComicPanelPrompt.id).where(ComicPanelPrompt.task_id == task_id)).scalar_one()


def current_prompt_job_id(prompt_id: int) -> int | None:
    with session_scope() as session:
        return session.get(ComicPanelPrompt, prompt_id).image_job_id


def mark_prompt_job_failed(job_id: int) -> None:
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        job.status = "failed"
        job.error_message = "provider rejected"
        session.commit()


def delete_reference_rows(job_id: int) -> None:
    with session_scope() as session:
        session.execute(delete(ImageJobReferenceAsset).where(ImageJobReferenceAsset.job_id == job_id))
        session.commit()


def image_job_ids() -> list[int]:
    with session_scope() as session:
        return list(session.execute(select(ImageJob.id)).scalars())


def job_prompts() -> list[str]:
    with session_scope() as session:
        return list(session.execute(select(ImageJob.prompt)).scalars())


def all_page_jobs_have_reference_rows() -> bool:
    with session_scope() as session:
        job_ids = set(session.execute(select(ComicPanelPrompt.image_job_id)).scalars())
        reference_job_ids = set(session.execute(select(ImageJobReferenceAsset.job_id)).scalars())
        return bool(job_ids) and job_ids <= reference_job_ids


def count_image_jobs() -> int:
    return len(image_job_ids())
