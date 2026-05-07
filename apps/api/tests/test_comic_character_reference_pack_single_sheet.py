from __future__ import annotations

import json
from io import BytesIO
from zipfile import ZipFile

from apps.api.app.domains.comic.models import ComicCharacterCard, ComicTask
from apps.api.app.domains.image.models import Asset
from apps.api.app.infra.db.session import session_scope
from apps.api.app.infra.storage.factory import build_asset_storage
from apps.api.tests.test_comic_pipeline import create_comic_client, create_task


def test_export_shared_single_sheet_asset_once_for_all_characters() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_cards_sharing_reference_asset(task_id=task["id"])

    response = client.get(f"/api/public/comic/tasks/{task['id']}/character-references/export")

    assert response.status_code == 200
    archive = ZipFile(BytesIO(response.content))
    assert sorted(archive.namelist()) == ["characters.json", "images/Lin.png"]
    manifest = json.loads(archive.read("characters.json"))
    assert {item["image_file"] for item in manifest["characters"]} == {"images/Lin.png"}
    assert archive.read("images/Lin.png") == b"single-sheet"


def seed_cards_sharing_reference_asset(*, task_id: str) -> None:
    with session_scope() as session:
        task = session.get(ComicTask, task_id)
        key = "references/single-sheet.png"
        build_asset_storage().write_bytes(key, b"single-sheet", "image/png")
        asset = Asset(
            owner_user_id=task.user_id,
            owner_anonymous_session_id=task.anonymous_session_id,
            storage_path=key,
            mime_type="image/png",
        )
        session.add(asset)
        session.flush()
        session.add_all([
            build_card(task=task, code="hero", name="Lin", asset_id=asset.id),
            build_card(task=task, code="mentor", name="Monk Qiao", asset_id=asset.id),
        ])


def build_card(*, task: ComicTask, code: str, name: str, asset_id: int) -> ComicCharacterCard:
    return ComicCharacterCard(
        project_id=task.project_id,
        task_id=task.id,
        character_code=code,
        name=name,
        role_in_story="main cast",
        personality="calm",
        appearance={"hair": "black hair"},
        costume={"robe": "dark robe"},
        color_palette=["ink", "jade"],
        must_keep_prompt=f"Keep {name} identity.",
        negative_prompt=f"Do not alter {name}.",
        multi_view_prompt=f"{name} character sheet.",
        reference_asset_id=asset_id,
    )
