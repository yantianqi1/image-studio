from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from apps.api.app.domains.comic.models import ComicCharacterCard, ComicPanelPrompt, ComicStoryboard, ComicTask
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobReferenceAsset, ImageJobResult
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_comic_pipeline import build_input_payload, create_comic_client, create_task


def test_single_sheet_mode_enqueues_one_shared_reference_job() -> None:
    client, task_id = create_task_with_characters(reference_mode="single_sheet")

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")

    data = response.json()["data"]
    job_ids = [item["reference_image_job_id"] for item in data["characters"]]
    assert response.status_code == 201
    assert data["character_count"] == 2
    assert data["created_count"] == 1
    assert len(set(job_ids)) == 1
    assert count_image_jobs() == 1
    assert_reference_prompt_mentions_all_characters(job_ids[0])
    assert_reference_prompt_requires_name_labels(job_ids[0])
    assert_reference_prompt_aligns_with_selected_style(job_ids[0])


def test_single_sheet_mode_syncs_shared_asset_to_all_characters() -> None:
    client, task_id = create_task_with_characters(reference_mode="single_sheet")
    job_id = first_reference_job_id(client, task_id)
    asset_id = seed_job_result(job_id)

    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references/sync")

    characters = response.json()["data"]["characters"]
    assert response.status_code == 200
    assert {item["reference_asset_id"] for item in characters} == {asset_id}
    assert {item["image_status"] for item in characters} == {"succeeded"}


def test_page_generation_deduplicates_shared_reference_asset() -> None:
    client, task_id, asset_id = create_page_task_with_shared_reference_asset()

    response = client.post(f"/api/public/comic/tasks/{task_id}/approve-and-generate-images")

    data = response.json()["data"]
    page_job_id = data["prompts"][0]["image_job_id"]
    assert response.status_code == 201
    assert reference_asset_ids(page_job_id) == [asset_id]


def create_task_with_characters(*, reference_mode: str) -> tuple:
    client = create_comic_client()
    task = create_task(client, input_payload=task_payload(reference_mode=reference_mode))
    with session_scope() as session:
        task_model = session.get(ComicTask, task["id"])
        mark_completed(task_model)
        add_character_cards(session, task_model=task_model)
        session.commit()
    return client, task["id"]


def create_page_task_with_shared_reference_asset() -> tuple:
    client = create_comic_client()
    task = create_task(client, input_payload=task_payload(reference_mode="single_sheet"))
    with session_scope() as session:
        task_model = session.get(ComicTask, task["id"])
        mark_completed(task_model)
        asset = Asset(
            owner_user_id=task_model.user_id,
            owner_anonymous_session_id=task_model.anonymous_session_id,
            storage_path="/tmp/all-characters.png",
            mime_type="image/png",
        )
        session.add(asset)
        session.flush()
        add_character_cards(session, task_model=task_model, reference_asset_id=asset.id)
        add_panel_prompt(session, task_model=task_model)
        session.commit()
        return client, task["id"], asset.id


def task_payload(*, reference_mode: str) -> dict:
    payload = build_input_payload()
    payload["character_reference_mode"] = reference_mode
    return payload


def mark_completed(task: ComicTask) -> None:
    task.status = "completed"
    task.stage = "completed"
    task.finished_at = datetime.utcnow()


def add_character_cards(session, *, task_model: ComicTask, reference_asset_id: int | None = None) -> None:
    cards = [
        build_card(task_model=task_model, code="hero", name="Lin", reference_asset_id=reference_asset_id),
        build_card(task_model=task_model, code="mentor", name="Monk Qiao", reference_asset_id=reference_asset_id),
    ]
    session.add_all(cards)


def build_card(*, task_model: ComicTask, code: str, name: str, reference_asset_id: int | None) -> ComicCharacterCard:
    return ComicCharacterCard(
        project_id=task_model.project_id,
        task_id=task_model.id,
        character_code=code,
        name=name,
        role_in_story="recurring character",
        personality="disciplined",
        appearance={"face": f"{name} oval face", "hair": "black hair"},
        costume={"main": f"{name} fixed robe silhouette"},
        color_palette=["ink black", "jade"],
        must_keep_prompt=f"{name} fixed face, black hair, fixed robe silhouette.",
        negative_prompt=f"Do not change {name} face, hair, or costume.",
        multi_view_prompt=f"{name} front side back character sheet.",
        reference_asset_id=reference_asset_id,
    )


def add_panel_prompt(session, *, task_model: ComicTask) -> None:
    storyboard = ComicStoryboard(project_id=task_model.project_id, task_id=task_model.id, style_preset="baimiao", panels_per_image=3, target_image_count=1, payload={"images": []})
    session.add(storyboard)
    session.flush()
    prompt = ComicPanelPrompt(project_id=task_model.project_id, task_id=task_model.id, storyboard_id=storyboard.id, image_index=1, panel_count=3, character_codes=["hero", "mentor"], prompt="Panel prompt", negative_prompt="low quality", model_code="gpt-image-2", status="prompt_ready")
    session.add(prompt)


def first_reference_job_id(client, task_id: str) -> int:
    response = client.post(f"/api/public/comic/tasks/{task_id}/character-references")
    return response.json()["data"]["characters"][0]["reference_image_job_id"]


def seed_job_result(job_id: int) -> int:
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        job.status = "succeeded"
        asset = Asset(
            owner_user_id=job.user_id,
            owner_anonymous_session_id=job.anonymous_session_id,
            storage_path=f"/tmp/ref-{job_id}.png",
            mime_type="image/png",
        )
        session.add(asset)
        session.flush()
        session.add(ImageJobResult(job_id=job_id, result_index=1, asset_id=asset.id, asset_url=f"/api/public/image/assets/{asset.id}"))
        return asset.id


def count_image_jobs() -> int:
    with session_scope() as session:
        return len(list(session.execute(select(ImageJob.id)).scalars()))


def assert_reference_prompt_mentions_all_characters(job_id: int) -> None:
    with session_scope() as session:
        prompt = session.get(ImageJob, job_id).prompt
    assert "Lin" in prompt
    assert "Monk Qiao" in prompt


def assert_reference_prompt_requires_name_labels(job_id: int) -> None:
    with session_scope() as session:
        prompt = session.get(ImageJob, job_id).prompt
    assert "Simplified Chinese text label" in prompt
    assert "Label: Lin" in prompt
    assert "Label: Monk Qiao" in prompt
    assert "Do not render text labels" not in prompt


def assert_reference_prompt_aligns_with_selected_style(job_id: int) -> None:
    with session_scope() as session:
        prompt = session.get(ImageJob, job_id).prompt
    assert "Character reference style alignment" in prompt
    assert "Clean Baimiao Line-art Comic" in prompt
    assert "clean manhua/comic aesthetic" in prompt
    assert "reference sheet" in prompt
    assert "9:16 mobile webtoon-style reading experience" not in prompt


def reference_asset_ids(job_id: int) -> list[int]:
    with session_scope() as session:
        statement = select(ImageJobReferenceAsset.asset_id).where(ImageJobReferenceAsset.job_id == job_id)
        return list(session.execute(statement.order_by(ImageJobReferenceAsset.sequence.asc())).scalars())
