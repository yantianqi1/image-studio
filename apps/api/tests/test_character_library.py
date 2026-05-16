from __future__ import annotations

import base64
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.core.config import get_settings
from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.character_library.models import CharacterLibraryEntry
from apps.api.app.domains.character_library.service import character_payload
from apps.api.app.domains.image.models import Asset, ImageJob, ImageJobReferenceAsset
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app

VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


class MissingThumbnailPublicStorage:
    def public_url(self, key: str) -> str:
        return f"https://cdn.example.test/{key}"

    def exists(self, key: str) -> bool:
        return False


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def new_client() -> TestClient:
    return TestClient(create_app())


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def register_user(client: TestClient, email: str) -> None:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201


def upload_character(client: TestClient, url: str, name: str) -> dict[str, object]:
    response = client.post(
        url,
        data={"name": name},
        files={"file": ("character.png", VALID_PNG_BYTES, "image/png")},
    )
    assert response.status_code == 201
    return response.json()["data"]


def test_admin_public_character_is_visible_to_anonymous_users() -> None:
    admin = build_client()
    seed_admin()
    admin_login(admin)
    character = upload_character(admin, "/api/admin/character-library", "公共少女")

    anonymous = new_client()
    response = anonymous.get("/api/public/character-library")

    assert response.status_code == 200
    items = response.json()["data"]
    assert [(item["id"], item["name"], item["visibility"]) for item in items] == [
        (character["id"], "公共少女", "public")
    ]
    assert items[0]["thumbnail_url"].endswith(f"/image/assets/{character['asset_id']}/thumbnail")
    thumbnail_response = anonymous.get(items[0]["thumbnail_url"])
    assert thumbnail_response.status_code == 200
    assert thumbnail_response.headers["content-type"] == "image/jpeg"


def test_admin_character_library_uses_admin_image_urls() -> None:
    admin = build_client()
    seed_admin()
    admin_login(admin)
    character = upload_character(admin, "/api/admin/character-library", "后台公共形象")

    expected_prefix = f"/api/admin/image/assets/{character['asset_id']}"
    assert character["asset_url"] == expected_prefix
    assert character["thumbnail_url"] == expected_prefix
    image_response = admin.get(character["thumbnail_url"])
    assert image_response.status_code == 200
    assert image_response.headers["content-type"] == "image/png"


def test_character_payload_uses_api_thumbnail_when_public_thumbnail_missing() -> None:
    asset = Asset(id=42, storage_path="uploads/upload-42.png", mime_type="image/png", created_at=datetime.utcnow())
    entry = CharacterLibraryEntry(
        id=7,
        name="远端形象",
        asset_id=42,
        visibility="public",
        owner_user_id=None,
        created_at=datetime.utcnow(),
    )

    payload = character_payload(entry, storage=MissingThumbnailPublicStorage(), asset=asset)

    assert payload["asset_url"] == "https://cdn.example.test/uploads/upload-42.png"
    assert payload["thumbnail_url"] == "/api/public/image/assets/42/thumbnail"


def test_private_character_upload_requires_login() -> None:
    client = build_client()

    response = client.post(
        "/api/public/character-library",
        data={"name": "私人形象"},
        files={"file": ("character.png", VALID_PNG_BYTES, "image/png")},
    )

    assert response.status_code == 401


def test_private_characters_are_visible_only_to_the_uploader() -> None:
    alice = build_client()
    register_user(alice, "alice-character@example.com")
    character = upload_character(alice, "/api/public/character-library", "Alice 专属")

    bob = new_client()
    register_user(bob, "bob-character@example.com")
    anonymous = new_client()

    alice_items = alice.get("/api/public/character-library").json()["data"]
    bob_items = bob.get("/api/public/character-library").json()["data"]
    anonymous_items = anonymous.get("/api/public/character-library").json()["data"]

    assert character["id"] in {item["id"] for item in alice_items}
    assert character["id"] not in {item["id"] for item in bob_items}
    assert character["id"] not in {item["id"] for item in anonymous_items}


def test_private_character_owner_can_delete_entry_and_asset() -> None:
    client = build_client()
    register_user(client, "delete-character@example.com")
    character = upload_character(client, "/api/public/character-library", "可删除形象")

    response = client.delete(f"/api/public/character-library/{character['id']}")

    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True, "id": character["id"]}
    items = client.get("/api/public/character-library").json()["data"]
    assert character["id"] not in {item["id"] for item in items}
    with session_scope() as session:
        assert session.get(CharacterLibraryEntry, character["id"]) is None
        assert session.get(Asset, character["asset_id"]) is None


def test_private_character_delete_rejects_other_users() -> None:
    alice = build_client()
    register_user(alice, "alice-delete-character@example.com")
    character = upload_character(alice, "/api/public/character-library", "Alice 删除保护")

    bob = new_client()
    register_user(bob, "bob-delete-character@example.com")
    response = bob.delete(f"/api/public/character-library/{character['id']}")

    assert response.status_code == 404
    alice_items = alice.get("/api/public/character-library").json()["data"]
    assert character["id"] in {item["id"] for item in alice_items}


def test_admin_can_delete_public_character_entry_and_asset() -> None:
    admin = build_client()
    seed_admin()
    admin_login(admin)
    character = upload_character(admin, "/api/admin/character-library", "待删除公共形象")

    response = admin.delete(f"/api/admin/character-library/{character['id']}")

    assert response.status_code == 200
    assert response.json()["data"] == {"deleted": True, "id": character["id"]}
    items = admin.get("/api/admin/character-library").json()["data"]
    assert character["id"] not in {item["id"] for item in items}
    with session_scope() as session:
        assert session.get(CharacterLibraryEntry, character["id"]) is None
        assert session.get(Asset, character["asset_id"]) is None


def test_admin_can_delete_public_character_when_storage_object_is_missing() -> None:
    admin = build_client()
    seed_admin()
    admin_login(admin)
    character = upload_character(admin, "/api/admin/character-library", "缺失文件形象")
    with session_scope() as session:
        asset = session.get(Asset, character["asset_id"])
        assert asset is not None
        storage_path = asset.storage_path
    asset_path = Path(get_settings().generated_assets_dir) / storage_path
    assert asset_path.is_file()
    asset_path.unlink()

    response = admin.delete(f"/api/admin/character-library/{character['id']}")

    assert response.status_code == 200
    with session_scope() as session:
        assert session.get(CharacterLibraryEntry, character["id"]) is None
        assert session.get(Asset, character["asset_id"]) is None


def test_admin_can_update_public_character_name_and_image() -> None:
    admin = build_client()
    seed_admin()
    admin_login(admin)
    character = upload_character(admin, "/api/admin/character-library", "旧形象")

    response = admin.patch(
        f"/api/admin/character-library/{character['id']}",
        data={"name": "新形象"},
        files={"file": ("updated.png", VALID_PNG_BYTES, "image/png")},
    )

    assert response.status_code == 200
    updated = response.json()["data"]
    assert updated["id"] == character["id"]
    assert updated["name"] == "新形象"
    assert updated["asset_id"] != character["asset_id"]
    image_response = admin.get(updated["asset_url"])
    assert image_response.status_code == 200
    with session_scope() as session:
        entry = session.get(CharacterLibraryEntry, character["id"])
        assert entry is not None
        assert entry.name == "新形象"
        assert entry.asset_id == updated["asset_id"]


def test_image_job_with_character_library_adds_reference_asset_and_prompt_instruction() -> None:
    admin = build_client()
    seed_admin()
    admin_login(admin)
    character = upload_character(admin, "/api/admin/character-library", "黑发少年")

    response = new_client().post(
        "/api/public/image/jobs",
        json={
            "prompt": "让这个角色在雨夜街头奔跑，穿蓝色风衣",
            "model_code": "gpt-image-2",
            "requested_count": 1,
            "character_library_ids": [character["id"]],
        },
    )

    assert response.status_code == 201
    job_id = response.json()["data"]["id"]
    with session_scope() as session:
        job = session.get(ImageJob, job_id)
        reference_ids = list(
            session.execute(
                select(ImageJobReferenceAsset.asset_id).where(ImageJobReferenceAsset.job_id == job_id)
            ).scalars()
        )

    assert job is not None
    assert reference_ids == [character["asset_id"]]
    assert "形象库参考：黑发少年" in job.prompt
    assert "不要照抄参考图的姿势、动作、表情、构图或背景" in job.prompt
    assert "如果用户提示词没有明确指定服装" in job.prompt
    assert "如果用户明确指定服装，以用户提示词为准" in job.prompt
