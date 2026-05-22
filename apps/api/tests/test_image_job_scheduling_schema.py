from apps.api.app.domains.image.models import ImageJobItem, ProviderRuntimeState


def test_image_job_item_has_scheduler_v2_columns() -> None:
    columns = ImageJobItem.__table__.columns
    indexes = {index.name for index in ImageJobItem.__table__.indexes}

    for name in ["scheduler_score", "cancelled_at", "cancel_reason"]:
        assert name in columns
    assert "ix_image_job_items_scheduler_queue_pick" in indexes


def test_provider_runtime_state_schema_is_available() -> None:
    columns = ProviderRuntimeState.__table__.columns

    assert ProviderRuntimeState.__tablename__ == "provider_runtime_state"
    for name in [
        "provider_id",
        "status",
        "failure_count",
        "last_failure_at",
        "circuit_open_until",
        "updated_at",
    ]:
        assert name in columns
