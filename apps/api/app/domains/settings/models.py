from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.app.domains.public_quota.constants import (
    DEFAULT_PUBLIC_QUOTA_DAILY_GLOBAL_LIMIT,
    DEFAULT_PUBLIC_QUOTA_MODE,
    DEFAULT_PUBLIC_QUOTA_PER_IP_LIMIT,
)
from apps.api.app.infra.db.base import Base


class SiteSettings(Base):
    __tablename__ = "site_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_title: Mapped[str] = mapped_column(String(255), default="image Studio", nullable=False)
    allow_public_signup: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_anonymous_image: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    uploads_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    public_quota_mode: Mapped[str] = mapped_column(String(32), default=DEFAULT_PUBLIC_QUOTA_MODE, nullable=False)
    public_quota_daily_global_limit: Mapped[int] = mapped_column(
        Integer,
        default=DEFAULT_PUBLIC_QUOTA_DAILY_GLOBAL_LIMIT,
        nullable=False,
    )
    public_quota_per_ip_limit: Mapped[int] = mapped_column(
        Integer,
        default=DEFAULT_PUBLIC_QUOTA_PER_IP_LIMIT,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
