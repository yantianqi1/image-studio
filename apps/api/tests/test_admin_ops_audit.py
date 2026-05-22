from __future__ import annotations

import json

from apps.api.app.infra.db.session import session_scope
from apps.api.tests.test_admin_image_runtime_ops import (
    admin_login,
    build_client,
    seed_admin,
    seed_dead_letter_item,
    seed_provider,
    seed_queued_item,
    seed_running_item,
)
from apps.api.tests.test_worker_observability import seed_worker_node


def test_image_admin_mutations_write_audit_logs() -> None:
    client = build_client()
    seed_admin()
    with session_scope() as session:
        retry_item_id = seed_dead_letter_item(session)
        cancel_item_id = seed_running_item(session)
        priority_job_id = seed_queued_item(session)
    admin_login(client)

    retry_response = client.post(f"/api/admin/image/items/{retry_item_id}/retry")
    cancel_response = client.post(f"/api/admin/image/items/{cancel_item_id}/cancel")
    priority_response = client.post(f"/api/admin/image/jobs/{priority_job_id}/priority", json={"priority": 8})

    assert retry_response.status_code == 200
    assert cancel_response.status_code == 200
    assert priority_response.status_code == 200
    assert audit_actions(client, "image_job_item", retry_item_id) == ["image.item.retry"]
    assert audit_actions(client, "image_job_item", cancel_item_id) == ["image.item.cancel"]
    priority_logs = audit_logs(client, "image_job", priority_job_id)
    assert [item["action"] for item in priority_logs] == ["image.job.priority.update"]
    assert priority_logs[0]["metadata"]["priority"] == 8
    assert_metadata_is_sanitized(priority_logs[0]["metadata"])


def test_provider_and_worker_ops_write_audit_logs() -> None:
    client = build_client()
    seed_admin()
    with session_scope() as session:
        provider_id = seed_provider(session)
        seed_worker_node(session, worker_id="worker-a", status="running")
    admin_login(client)

    pause_response = client.post(f"/api/admin/image/providers/{provider_id}/pause")
    resume_response = client.post(f"/api/admin/image/providers/{provider_id}/resume")
    drain_response = client.post("/api/admin/ops/workers/worker-a/drain")
    worker_resume_response = client.post("/api/admin/ops/workers/worker-a/resume")

    assert pause_response.status_code == 200
    assert resume_response.status_code == 200
    assert drain_response.status_code == 200
    assert worker_resume_response.status_code == 200
    assert audit_actions(client, "provider", provider_id) == ["image.provider.pause", "image.provider.resume"]
    assert audit_actions(client, "worker_node", "worker-a") == ["worker.drain", "worker.resume"]


def test_settings_update_writes_sanitized_audit_log() -> None:
    client = build_client()
    seed_admin()
    admin_login(client)

    response = client.patch(
        "/api/admin/settings",
        json={
            "site_title": "Studio Ops",
            "allow_public_signup": True,
            "allow_anonymous_image": False,
            "uploads_enabled": True,
            "client_provider_url_pool": "https://first.example/v1\nhttps://second.example/v1",
        },
    )

    assert response.status_code == 200
    logs = audit_logs(client, "site_settings", response.json()["data"].get("id", 1))
    assert [item["action"] for item in logs] == ["settings.update"]
    assert logs[0]["metadata"]["client_provider_url_pool_lines"] == 2
    assert_metadata_is_sanitized(logs[0]["metadata"])


def audit_actions(client, target_type: str, target_id: int | str) -> list[str]:
    return [item["action"] for item in audit_logs(client, target_type, target_id)]


def audit_logs(client, target_type: str, target_id: int | str) -> list[dict[str, object]]:
    response = client.get("/api/admin/audit-logs", params={"target_type": target_type, "target_id": str(target_id)})
    assert response.status_code == 200
    return response.json()["data"]["items"]


def assert_metadata_is_sanitized(metadata: dict[str, object]) -> None:
    serialized = json.dumps(metadata, sort_keys=True).lower()
    assert "secret" not in serialized
    assert "token" not in serialized
    assert "api_key" not in serialized
    assert "authorization" not in serialized
