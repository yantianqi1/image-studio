from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.infra.db.base import Base

MODE_LENGTH = 32
KEY_LENGTH = 128
FEATURE_LENGTH = 32
REFERENCE_TYPE_LENGTH = 64
REFERENCE_ID_LENGTH = 128
IP_HASH_LENGTH = 64


class PublicQuotaBucket(Base):
    __tablename__ = "public_quota_buckets"
    __table_args__ = (
        UniqueConstraint("quota_mode", "quota_key", name="uq_public_quota_buckets_mode_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    quota_mode: Mapped[str] = mapped_column(String(MODE_LENGTH), nullable=False, index=True)
    quota_key: Mapped[str] = mapped_column(String(KEY_LENGTH), nullable=False, index=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    limit_count: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PublicQuotaUsage(Base):
    __tablename__ = "public_quota_usages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bucket_id: Mapped[int] = mapped_column(ForeignKey("public_quota_buckets.id"), nullable=False, index=True)
    feature: Mapped[str] = mapped_column(String(FEATURE_LENGTH), nullable=False, index=True)
    units: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    reference_type: Mapped[str] = mapped_column(String(REFERENCE_TYPE_LENGTH), nullable=False)
    reference_id: Mapped[str] = mapped_column(String(REFERENCE_ID_LENGTH), nullable=False)
    request_ip_hash: Mapped[Optional[str]] = mapped_column(String(IP_HASH_LENGTH), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
