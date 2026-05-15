from __future__ import annotations

import base64

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.image.models import ImageJob, ImageJobReferenceAsset
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app

VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


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

    response = new_client().get("/api/public/character-library")

    assert response.status_code == 200
    items = response.json()["data"]
    assert [(item["id"], item["name"], item["visibility"]) for item in items] == [
        (character["id"], "公共少女", "public")
    ]
    assert items[0]["thumbnail_url"].endswith(f"/image/assets/{character['asset_id']}/thumbnail")


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
