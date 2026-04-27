from typing import Literal

from pydantic import BaseModel, Field

from apps.api.app.domains.public_quota.constants import (
    PUBLIC_QUOTA_MODE_DAILY_GLOBAL,
    PUBLIC_QUOTA_MODE_PER_IP,
)


class SettingsUpdateRequest(BaseModel):
    site_title: str = Field(min_length=1, max_length=255)
    allow_public_signup: bool
    allow_anonymous_image: bool
    uploads_enabled: bool
    public_quota_mode: Literal[PUBLIC_QUOTA_MODE_DAILY_GLOBAL, PUBLIC_QUOTA_MODE_PER_IP] | None = None
    public_quota_daily_global_limit: int | None = Field(default=None, ge=1)
    public_quota_per_ip_limit: int | None = Field(default=None, ge=1)
