from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.infra.db.base import Base


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    base_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    api_key_env: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    default_model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SellableModel(Base):
    __tablename__ = "sellable_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    capability: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"), nullable=False)
    provider_model: Mapped[str] = mapped_column(String(128), nullable=False)
    public_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    member_price_cents: Mapped[int] = mapped_column(Integer, default=25, nullable=False)
    anonymous_price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)


class ModelVariant(Base):
    __tablename__ = "model_variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("sellable_models.id"), nullable=False, index=True)
    size: Mapped[str] = mapped_column(String(64), nullable=False)
    quality: Mapped[str] = mapped_column(String(32), nullable=False)
    upstream_provider_model: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    member_price_credits: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    member_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    anonymous_price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_manually_set: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
