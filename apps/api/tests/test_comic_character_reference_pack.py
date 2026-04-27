from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from apps.api.app.core.config import get_settings
from apps.api.app.domains.comic.models import ComicCharacterCard, ComicTask
from apps.api.app.domains.image.models import Asset
from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_comic_pipeline import create_comic_client, create_task


def test_export_character_reference_pack_contains_manifest_and_named_images() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_cards(task_id=task["id"], ready=True)

    response = client.get(f"/api/public/comic/tasks/{task['id']}/character-references/export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    archive = ZipFile(BytesIO(response.content))
    names = sorted(archive.namelist())
    assert names == ["characters.json", "images/林安-2.png", "images/林安.png"]
    manifest = json.loads(archive.read("characters.json"))
    assert manifest["schema_version"] == 1
    assert manifest["source_task_id"] == task["id"]
    assert [item["image_file"] for item in manifest["characters"]] == [
        "images/林安.png",
        "images/林安-2.png",
    ]
    assert archive.read("images/林安.png") == b"hero-reference"
    assert archive.read("images/林安-2.png") == b"mentor-reference"


def test_export_character_reference_pack_requires_ready_references() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_cards(task_id=task["id"], ready=False)

    response = client.get(f"/api/public/comic/tasks/{task['id']}/character-references/export")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "comic_character_references_not_ready"


def test_export_character_reference_pack_names_image_from_asset_mime_type() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_card_with_asset(
        task_id=task["id"],
        storage_name="provider-output.svg",
        mime_type="image/png",
        content=b"png-bytes",
    )

    response = client.get(f"/api/public/comic/tasks/{task['id']}/character-references/export")

    assert response.status_code == 200
    archive = ZipFile(BytesIO(response.content))
    assert "images/林安.png" in archive.namelist()
    assert archive.read("images/林安.png") == b"png-bytes"


def test_import_character_reference_pack_binds_uploaded_images_to_cards() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_cards(task_id=task["id"], ready=False)
    archive = build_pack_archive([
        {"character_code": "hero", "name": "林安", "image_file": "images/hero.png", "content": b"new-hero"},
        {"character_code": "mentor", "name": "林安", "image_file": "images/mentor.png", "content": b"new-mentor"},
    ])

    response = client.post(
        f"/api/public/comic/tasks/{task['id']}/character-references/import",
        files={"file": ("characters.zip", archive, "application/zip")},
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["imported_count"] == 2
    assert data["ready"] is True
    assert_imported_card_contents(task_id=task["id"])


def test_imported_character_reference_pack_skips_reference_job_creation() -> None:
    client = create_comic_client()
    task = create_task(client)
    mark_task_completed(task_id=task["id"])
    seed_reference_cards(task_id=task["id"], ready=False)
    archive = build_pack_archive([
        {"character_code": "hero", "name": "林安", "image_file": "images/hero.png", "content": b"new-hero"},
        {"character_code": "mentor", "name": "林安", "image_file": "images/mentor.png", "content": b"new-mentor"},
    ])
    import_response = client.post(
        f"/api/public/comic/tasks/{task['id']}/character-references/import",
        files={"file": ("characters.zip", archive, "application/zip")},
    )
    assert import_response.status_code == 201

    response = client.post(f"/api/public/comic/tasks/{task['id']}/character-references")

    data = response.json()["data"]
    assert response.status_code == 201
    assert data["created_count"] == 0
    assert data["reused_count"] == 2


def test_import_character_reference_pack_rejects_missing_manifest() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_cards(task_id=task["id"], ready=False)
    archive = build_raw_archive({"images/hero.png": b"new-hero"})

    response = client.post(
        f"/api/public/comic/tasks/{task['id']}/character-references/import",
        files={"file": ("characters.zip", archive, "application/zip")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "comic_character_pack_manifest_missing"


def test_import_character_reference_pack_rejects_missing_image() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_cards(task_id=task["id"], ready=False)
    archive = build_raw_archive({"characters.json": manifest_bytes([
        {"character_code": "hero", "name": "林安", "image_file": "images/missing.png"},
    ])})

    response = client.post(
        f"/api/public/comic/tasks/{task['id']}/character-references/import",
        files={"file": ("characters.zip", archive, "application/zip")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "comic_character_pack_image_missing"


def test_import_character_reference_pack_rejects_unsafe_image_path() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_cards(task_id=task["id"], ready=False)
    archive = build_raw_archive({"characters.json": manifest_bytes([
        {"character_code": "hero", "name": "林安", "image_file": "../hero.png"},
    ])})

    response = client.post(
        f"/api/public/comic/tasks/{task['id']}/character-references/import",
        files={"file": ("characters.zip", archive, "application/zip")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "comic_character_pack_path_invalid"


def test_import_character_reference_pack_rejects_unmatched_character() -> None:
    client = create_comic_client()
    task = create_task(client)
    seed_reference_cards(task_id=task["id"], ready=False)
    archive = build_pack_archive([
        {"character_code": "villain", "name": "陌生人", "image_file": "images/villain.png", "content": b"villain"},
    ])

    response = client.post(
        f"/api/public/comic/tasks/{task['id']}/character-references/import",
        files={"file": ("characters.zip", archive, "application/zip")},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "comic_character_pack_character_unmatched"


def seed_reference_cards(*, task_id: str, ready: bool) -> None:
    with session_scope() as session:
        task = session.get(ComicTask, task_id)
        storage_dir = Path(get_settings().generated_assets_dir)
        storage_dir.mkdir(parents=True, exist_ok=True)
        hero_asset = add_asset(session, task=task, path=storage_dir / "hero.png", content=b"hero-reference") if ready else None
        mentor_asset = add_asset(session, task=task, path=storage_dir / "mentor.png", content=b"mentor-reference") if ready else None
        session.add_all([
            build_card(task=task, code="hero", asset_id=hero_asset.id if hero_asset else None),
            build_card(task=task, code="mentor", asset_id=mentor_asset.id if mentor_asset else None),
        ])


def mark_task_completed(*, task_id: str) -> None:
    with session_scope() as session:
        task = session.get(ComicTask, task_id)
        task.status = "completed"
        task.stage = "completed"


def seed_reference_card_with_asset(
    *,
    task_id: str,
    storage_name: str,
    mime_type: str,
    content: bytes,
) -> None:
    with session_scope() as session:
        task = session.get(ComicTask, task_id)
        storage_dir = Path(get_settings().generated_assets_dir)
        storage_dir.mkdir(parents=True, exist_ok=True)
        asset_path = storage_dir / storage_name
        asset_path.write_bytes(content)
        asset = Asset(
            owner_user_id=task.user_id,
            owner_anonymous_session_id=task.anonymous_session_id,
            storage_path=str(asset_path),
            mime_type=mime_type,
        )
        session.add(asset)
        session.flush()
        session.add(build_card(task=task, code="hero", asset_id=asset.id))


def add_asset(session, *, task: ComicTask, path: Path, content: bytes) -> Asset:
    path.write_bytes(content)
    asset = Asset(
        owner_user_id=task.user_id,
        owner_anonymous_session_id=task.anonymous_session_id,
        storage_path=str(path),
        mime_type="image/png",
    )
    session.add(asset)
    session.flush()
    return asset


def build_card(*, task: ComicTask, code: str, asset_id: int | None) -> ComicCharacterCard:
    return ComicCharacterCard(
        project_id=task.project_id,
        task_id=task.id,
        character_code=code,
        name="林安",
        role_in_story="main cast",
        personality="calm",
        appearance={"hair": "black hair"},
        costume={"robe": "dark robe"},
        color_palette=["ink", "jade"],
        must_keep_prompt="Keep the same face and hair.",
        negative_prompt="Do not alter the face.",
        multi_view_prompt="Front side back character sheet.",
        reference_asset_id=asset_id,
    )


def build_pack_archive(characters: list[dict]) -> bytes:
    files = {"characters.json": manifest_bytes(characters)}
    for character in characters:
        files[str(character["image_file"])] = bytes(character["content"])
    return build_raw_archive(files)


def build_raw_archive(files: dict[str, bytes]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)
    return buffer.getvalue()


def manifest_bytes(characters: list[dict]) -> bytes:
    payload = {
        "schema_version": 1,
        "characters": [strip_content_field(item) for item in characters],
    }
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def strip_content_field(item: dict) -> dict:
    return {key: value for key, value in item.items() if key != "content"}


def assert_imported_card_contents(*, task_id: str) -> None:
    with session_scope() as session:
        cards = session.query(ComicCharacterCard).filter_by(task_id=task_id).order_by(ComicCharacterCard.character_code).all()
        contents = [Path(session.get(Asset, card.reference_asset_id).storage_path).read_bytes() for card in cards]
    assert contents == [b"new-hero", b"new-mentor"]
