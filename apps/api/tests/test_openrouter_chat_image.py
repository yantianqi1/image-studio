from __future__ import annotations

import base64
from dataclasses import dataclass

from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.domains.auth.service import create_admin_account
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.api.app.main import create_app
from apps.worker.worker.tasks import image_jobs as worker_image_jobs


VALID_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
)


@dataclass(frozen=True)
class FakeHttpResponse:
    status_code: int
    payload: dict[str, object]
    headers: dict[str, str]
    content: bytes = b""

    @property
    def text(self) -> str:
        return str(self.payload)

    def json(self) -> dict[str, object]:
        return self.payload


def build_client() -> TestClient:
    initialize_database()
    return TestClient(create_app())


def register_user(client: TestClient, *, email: str) -> dict[str, object]:
    response = client.post("/api/public/auth/register", json={"email": email, "password": "top-secret"})
    assert response.status_code == 201
    return response.json()["data"]


def seed_admin() -> None:
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")


def admin_login(client: TestClient) -> None:
    response = client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    assert response.status_code == 200


def test_openrouter_catalog_seed_exposes_image_channel(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-openrouter")
    client = build_client()
    seed_admin()
    admin_login(client)

    providers_response = client.get("/api/admin/providers")
    models_response = client.get("/api/public/models")

    assert providers_response.status_code == 200
    assert models_response.status_code == 200
    providers = providers_response.json()["data"]
    models = models_response.json()["data"]
    assert any(item["name"] == "openrouter" and item["type"] == "openrouter-chat-image" for item in providers)
    openrouter_model = next(item for item in models if item["code"] == "gpt-image-2-openrouter")
    assert openrouter_model["display_name"] == "GPT Image 2 OpenRouter"
    assert find_variant(openrouter_model, size="1024x1024", quality="medium")["member_price_cents"] == 150
    assert find_variant(openrouter_model, size="768x1344", quality="high")["member_price_cents"] == 300
    assert find_variant(openrouter_model, size="896x1152", quality="low")["member_price_cents"] == 80
    assert find_variant(openrouter_model, size="1152x896", quality="low")["member_price_cents"] == 80


def test_openrouter_job_routes_payload_and_records_usage(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-openrouter")
    monkeypatch.setenv("SIGNUP_BONUS_CENTS", "1000")
    client = build_client()
    register_user(client, email="openrouter-route@example.com")
    captured = install_openrouter_http_fakes(monkeypatch)
    create_response = create_openrouter_medium_job(client)

    job_id = create_response.json()["data"]["id"]
    processed_job_id = worker_image_jobs.run_next_image_job()
    job_response = client.get(f"/api/public/image/jobs/{job_id}")
    results_response = client.get(f"/api/public/image/jobs/{job_id}/results")
    channel_cost = load_openrouter_channel_cost(client)

    assert create_response.status_code == 201
    assert create_response.json()["data"]["charge_cents"] == 150
    assert processed_job_id == job_id
    assert_openrouter_request_payload(captured)
    assert captured["download_url"] == "https://cdn.example.test/or.png"
    assert results_response.json()["data"][0]["provider_request_id"] == "or-req-1"
    assert_openrouter_usage(job_response.json()["data"], channel_cost)


def install_openrouter_http_fakes(monkeypatch) -> dict[str, object]:
    captured: dict[str, object] = {}

    def fake_post(url: str, *, headers, json, timeout: float):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeHttpResponse(
            status_code=200,
            headers={"x-request-id": "or-req-1"},
            payload=build_openrouter_success_payload(),
        )

    def fake_get(url: str, *, timeout: float):
        captured.update({"download_url": url, "download_timeout": timeout})
        return FakeHttpResponse(
            status_code=200,
            payload={},
            headers={"content-type": "image/png"},
            content=VALID_PNG_BYTES,
        )

    monkeypatch.setattr("apps.api.app.domains.llm.openrouter_chat_image.httpx.post", fake_post)
    monkeypatch.setattr("apps.api.app.domains.llm.openrouter_chat_image.httpx.get", fake_get)
    return captured


def build_openrouter_success_payload() -> dict[str, object]:
    return {
        "choices": [{"message": {"images": [{"image_url": {"url": "https://cdn.example.test/or.png"}}]}}],
        "usage": {
            "prompt_tokens": 12,
            "completion_tokens": 34,
            "total_tokens": 46,
            "cost": 0.1234,
            "cost_details": {"upstream_inference_cost": 0.1},
        },
    }


def create_openrouter_medium_job(client: TestClient):
    return client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "OpenRouter image",
            "model_code": "gpt-image-2-openrouter",
            "requested_count": 1,
            "size": "1024x1024",
            "quality": "medium",
        },
    )


def load_openrouter_channel_cost(client: TestClient) -> dict[str, object]:
    seed_admin()
    admin_login(client)
    stats_response = client.get("/api/admin/image/stats")
    return next(
        item
        for item in stats_response.json()["data"]["channel_costs"]
        if item["key"] == "gpt-image-2-openrouter"
    )


def assert_openrouter_request_payload(captured: dict[str, object]) -> None:
    payload = captured["json"]
    assert isinstance(payload, dict)
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer sk-openrouter"
    assert payload["model"] == "openai/gpt-image-2"
    assert payload["modalities"] == ["image", "text"]
    assert payload["image_config"] == {"aspect_ratio": "1:1", "image_size": "2K"}
    assert "size" not in payload
    assert "quality" not in payload


def assert_openrouter_usage(job: dict[str, object], channel_cost: dict[str, object]) -> None:
    assert job["provider_input_tokens"] == 12
    assert job["provider_output_tokens"] == 34
    assert job["provider_total_tokens"] == 46
    assert job["raw_provider_cost_cents"] == 10
    assert job["provider_fee_cents"] == 3
    assert job["internal_cost_cents"] == 13
    assert channel_cost["revenue_cents"] == 150
    assert channel_cost["internal_cost_cents"] == 13
    assert channel_cost["gross_margin_cents"] == 137


def test_openrouter_variant_price_adds_reference_and_edit_surcharges(monkeypatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-openrouter")
    monkeypatch.setenv("SIGNUP_BONUS_CENTS", "1000")
    client = build_client()
    register_user(client, email="openrouter-price@example.com")
    source_response = client.post(
        "/api/public/image/uploads",
        files={"file": ("source.png", b"source-image", "image/png")},
    )

    create_response = client.post(
        "/api/public/image/jobs",
        json={
            "prompt": "edit with openrouter",
            "model_code": "gpt-image-2-openrouter",
            "requested_count": 1,
            "mode": "edit",
            "source_asset_id": source_response.json()["data"]["id"],
            "size": "1024x1024",
            "quality": "medium",
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["data"]["charge_cents"] == 285
    with session_scope() as session:
        job = session.execute(select(ImageJob).where(ImageJob.id == create_response.json()["data"]["id"])).scalar_one()
        assert job.provider_model == "openai/gpt-image-2"


def test_openrouter_message_images_can_be_extracted() -> None:
    from apps.api.app.domains.llm.image_reference import extract_image_reference

    reference = extract_image_reference(
        {
            "choices": [
                {
                    "message": {
                        "images": [
                            {"type": "image_url", "image_url": {"url": "https://cdn.example.test/openrouter.png"}}
                        ]
                    }
                }
            ]
        }
    )

    assert reference.kind == "url"
    assert reference.value == "https://cdn.example.test/openrouter.png"


def test_openrouter_message_images_accept_official_rest_shape_without_type() -> None:
    from apps.api.app.domains.llm.image_reference import extract_image_reference

    reference = extract_image_reference(
        {
            "choices": [
                {
                    "message": {
                        "images": [
                            {"image_url": {"url": "data:image/png;base64,b3BlbnJvdXRlcg=="}}
                        ]
                    }
                }
            ]
        }
    )

    assert reference.kind == "base64"
    assert reference.value == "b3BlbnJvdXRlcg=="


def find_variant(model: dict[str, object], *, size: str, quality: str) -> dict[str, object]:
    variants = model["variants"]
    assert isinstance(variants, list)
    return next(item for item in variants if item["size"] == size and item["quality"] == quality)
