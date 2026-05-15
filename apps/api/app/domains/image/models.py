from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
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
    visibility: Mapped[str] = mapped_column(String(16), default="private", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="queued", nullable=False)
    requested_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    charge_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reservation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("wallet_reservations.id"), nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ImageJobResult(Base):
    __tablename__ = "image_job_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("image_jobs.id"), index=True, nullable=False)
    result_index: Mapped[int] = mapped_column(Integer, nullable=False)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    asset_url: Mapped[str] = mapped_column(String(255), nullable=False)
    revised_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_request_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class ImageJobReferenceAsset(Base):
    __tablename__ = "image_job_reference_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("image_jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
