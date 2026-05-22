from __future__ import annotations


IMAGE_JOB_PROVIDER_USAGE_COLUMNS = {
    "provider_input_tokens",
    "provider_output_tokens",
    "provider_total_tokens",
    "raw_provider_cost_cents",
    "provider_fee_cents",
    "internal_cost_cents",
    "provider_usage",
    "locked_by",
    "locked_at",
    "lease_expires_at",
    "heartbeat_at",
}


def assert_core_schema(inspector) -> None:
    assert inspector.has_table("users")
    assert inspector.has_table("providers")
    assert inspector.has_table("sellable_models")
    assert inspector.has_table("image_jobs")
    assert inspector.has_table("image_job_items")
    assert inspector.has_table("image_job_reference_assets")
    assert inspector.has_table("character_library_entries")
    assert inspector.has_table("anonymous_sessions")
    assert inspector.has_table("site_settings")
    assert_site_settings_schema(inspector)
    assert_sellable_model_schema(inspector)
    assert_llm_feature_settings_schema(inspector)
    assert_image_job_schema(inspector)
    assert_image_job_item_schema(inspector)
    assert_provider_runtime_state_schema(inspector)
    assert_provider_usage_event_schema(inspector)
    assert_worker_control_schema(inspector)
    assert_asset_schema(inspector)
    assert_owner_schema(inspector)
    assert_reference_asset_schema(inspector)
    assert_character_library_schema(inspector)
    assert_comic_schema(inspector)


def assert_site_settings_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("site_settings")}
    assert "client_provider_url_pool" in columns


def assert_sellable_model_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("sellable_models")}
    assert "status" in columns
    assert "member_price_cents" not in columns
    assert "anonymous_price_cents" not in columns
    assert not inspector.has_table("model_variants")
    indexes = {index["name"] for index in inspector.get_indexes("sellable_models")}
    assert "ix_sellable_models_status" in indexes


def assert_llm_feature_settings_schema(inspector) -> None:
    assert inspector.has_table("llm_feature_model_settings")
    columns = {column["name"] for column in inspector.get_columns("llm_feature_model_settings")}
    assert {"id", "feature_key", "model_code", "updated_at"} <= columns


def assert_image_job_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("image_jobs")}
    assert {
        "provider_id",
        "provider_model",
        "client_access_id",
        "client_provider_config",
        "anonymous_session_id",
        "storage_subdir",
        "conversation_messages",
        "title",
        "visibility",
        *IMAGE_JOB_PROVIDER_USAGE_COLUMNS,
    } <= columns
    assert "charge_cents" not in columns
    assert "reservation_id" not in columns
    indexes = {index["name"] for index in inspector.get_indexes("image_jobs")}
    required = {"ix_image_jobs_queue_pick", "ix_image_jobs_running_started_at"}
    assert required <= indexes
    assert {"ix_image_jobs_running_lease", "ix_image_jobs_locked_by"} <= indexes
    assert not inspector.has_table("wallets")
    assert not inspector.has_table("wallet_ledger")
    assert not inspector.has_table("wallet_reservations")
    assert not inspector.has_table("activation_code_batches")
    assert not inspector.has_table("activation_codes")


def assert_image_job_item_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("image_job_items")}
    assert {
        "id",
        "job_id",
        "result_index",
        "status",
        "attempt_count",
        "max_attempts",
        "available_at",
        "asset_id",
        "lease_expires_at",
        "priority",
        "dead_letter_at",
        "last_error_code",
        "last_error_message",
        "manual_retry_count",
        "scheduler_score",
        "cancelled_at",
        "cancel_reason",
    } <= columns
    indexes = {index["name"] for index in inspector.get_indexes("image_job_items")}
    assert {
        "ix_image_job_items_priority_queue_pick",
        "ix_image_job_items_scheduler_queue_pick",
        "ix_image_job_items_dead_letter_at",
        "ix_image_job_items_job_status",
        "ix_image_job_items_job_result",
        "ix_image_job_items_running_lease",
    } <= indexes
    constraints = {constraint["name"] for constraint in inspector.get_unique_constraints("image_job_results")}
    assert "uq_image_job_results_job_result" in constraints


def assert_provider_runtime_state_schema(inspector) -> None:
    assert inspector.has_table("provider_runtime_state")
    columns = {column["name"] for column in inspector.get_columns("provider_runtime_state")}
    assert {"provider_id", "status", "failure_count", "last_failure_at"} <= columns
    assert {"circuit_open_until", "updated_at"} <= columns


def assert_provider_usage_event_schema(inspector) -> None:
    assert inspector.has_table("image_provider_usage_events")
    columns = {column["name"] for column in inspector.get_columns("image_provider_usage_events")}
    assert {"id", "job_id", "item_id", "provider_id", "provider_name", "provider_model"} <= columns
    assert {"input_tokens", "output_tokens", "total_tokens", "raw_payload", "created_at"} <= columns
    indexes = {index["name"] for index in inspector.get_indexes("image_provider_usage_events")}
    assert "ix_image_provider_usage_events_job_id" in indexes


def assert_worker_control_schema(inspector) -> None:
    assert inspector.has_table("worker_nodes")
    node_columns = {column["name"] for column in inspector.get_columns("worker_nodes")}
    assert {"id", "worker_name", "status", "mode", "concurrency"} <= node_columns
    assert {"started_at", "last_heartbeat_at", "metadata"} <= node_columns
    assert inspector.has_table("worker_runtime_config")
    config_columns = {column["name"] for column in inspector.get_columns("worker_runtime_config")}
    assert {"config_key", "config_value", "updated_at"} <= config_columns
    assert inspector.has_table("runtime_ops_events")
    event_columns = {column["name"] for column in inspector.get_columns("runtime_ops_events")}
    assert {"event_type", "target_type", "target_id", "payload", "created_at"} <= event_columns


def assert_asset_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("assets")}
    assert {"owner_user_id", "owner_anonymous_session_id", "visibility", "published_at"} <= columns
    assert {"size_bytes", "sha256", "width", "height", "storage_backend"} <= columns
    assert {"thumbnail_storage_path", "deleted_at"} <= columns
    indexes = {index["name"] for index in inspector.get_indexes("assets")}
    assert {"ix_assets_visibility", "ix_assets_deleted_at"} <= indexes


def assert_owner_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("anonymous_sessions")}
    assert {"id", "token_hash", "created_at", "revoked_at", "rotated_from_id"} <= columns


def assert_reference_asset_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("image_job_reference_assets")}
    assert {"id", "job_id", "asset_id", "sequence", "created_at"} <= columns
    indexes = {index["name"] for index in inspector.get_indexes("image_job_reference_assets")}
    assert {"ix_image_job_reference_assets_job_id", "ix_image_job_reference_assets_asset_id"} <= indexes


def assert_character_library_schema(inspector) -> None:
    columns = {column["name"] for column in inspector.get_columns("character_library_entries")}
    assert {"id", "name", "asset_id", "visibility", "owner_user_id", "created_by_admin_user_id"} <= columns
    indexes = {index["name"] for index in inspector.get_indexes("character_library_entries")}
    assert "ix_character_library_entries_visibility" in indexes


def assert_comic_schema(inspector) -> None:
    task_columns = {column["name"] for column in inspector.get_columns("comic_tasks")}
    assert {"stage", "progress_percent", "user_id", "anonymous_session_id"} <= task_columns
    assert {"client_access_id", "client_provider_config", "request_ip_hash"} <= task_columns
    project_columns = {column["name"] for column in inspector.get_columns("comic_projects")}
    assert {"owner_user_id", "owner_anonymous_session_id"} <= project_columns
    assert inspector.has_table("comic_story_analyses")
    assert inspector.has_table("comic_character_cards")
    assert inspector.has_table("comic_storyboards")
    assert inspector.has_table("comic_panel_prompts")
