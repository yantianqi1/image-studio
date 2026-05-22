from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.infra.db.base import Base


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    owner_anonymous_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("anonymous_sessions.id"),
        nullable=True,
        index=True,
    )
    owner_client_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    storage_path: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    visibility: Mapped[str] = mapped_column(String(16), default="private", nullable=False, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    storage_backend: Mapped[str] = mapped_column(String(32), default="local", nullable=False)
    thumbnail_storage_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ImageJob(Base):
    __tablename__ = "image_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    anonymous_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("anonymous_sessions.id"),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model_code: Mapped[str] = mapped_column(String(128), nullable=False)
    source_asset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("assets.id"), nullable=True)
    provider_id: Mapped[Optional[int]] = mapped_column(ForeignKey("providers.id"), nullable=True)
    provider_model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    client_access_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    client_provider_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    conversation_messages: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    storage_subdir: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    quality: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    provider_input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider_output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider_total_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_provider_cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider_fee_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    internal_cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider_usage: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    visibility: Mapped[str] = mapped_column(String(16), default="private", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    requested_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    locked_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ImageJobResult(Base):
    __tablename__ = "image_job_results"
    __table_args__ = (UniqueConstraint("job_id", "result_index", name="uq_image_job_results_job_result"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("image_jobs.id"), index=True, nullable=False)
    result_index: Mapped[int] = mapped_column(Integer, nullable=False)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    asset_url: Mapped[str] = mapped_column(String(255), nullable=False)
    revised_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_request_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class ImageJobItem(Base):
    __tablename__ = "image_job_items"
    __table_args__ = (
        Index("ix_image_job_items_queue_pick", "status", "available_at", "id"),
        Index("ix_image_job_items_priority_queue_pick", "status", "priority", "available_at", "id"),
        Index(
            "ix_image_job_items_scheduler_queue_pick",
            "status",
            "priority",
            "scheduler_score",
            "available_at",
            "id",
        ),
        Index("ix_image_job_items_dead_letter_at", "dead_letter_at"),
        Index("ix_image_job_items_job_status", "job_id", "status"),
        Index("ix_image_job_items_job_result", "job_id", "result_index"),
        Index("ix_image_job_items_running_lease", "status", "lease_expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("image_jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    result_index: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scheduler_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    locked_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    asset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dead_letter_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    manual_retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ImageJobReferenceAsset(Base):
    __tablename__ = "image_job_reference_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("image_jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class ProviderRuntimeState(Base):
    __tablename__ = "provider_runtime_state"

    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), default="healthy", nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    circuit_open_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


def event_id_type():
    return BigInteger().with_variant(Integer, "sqlite")


class ImageJobEvent(Base):
    __tablename__ = "image_job_events"
    __table_args__ = (
        Index("ix_image_job_events_job_id_id", "job_id", "id"),
        Index("ix_image_job_events_event_type", "event_type"),
    )

    id: Mapped[int] = mapped_column(event_id_type(), primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("image_jobs.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("image_job_items.id", ondelete="SET NULL"))
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (
        Index("ix_outbox_events_status_available_at_id", "status", "available_at", "id"),
        Index("ix_outbox_events_aggregate", "aggregate_type", "aggregate_id"),
    )

    id: Mapped[int] = mapped_column(event_id_type(), primary_key=True, autoincrement=True)
    aggregate_type: Mapped[str] = mapped_column(String(64), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(128), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ImageProviderUsageEvent(Base):
    __tablename__ = "image_provider_usage_events"
    __table_args__ = (
        Index("ix_image_provider_usage_events_job_id", "job_id"),
        Index("ix_image_provider_usage_events_item_id", "item_id"),
        Index("ix_image_provider_usage_events_provider_id", "provider_id"),
    )

    id: Mapped[int] = mapped_column(event_id_type(), primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    item_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    provider_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    provider_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    provider_model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_provider_cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider_fee_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    internal_cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
