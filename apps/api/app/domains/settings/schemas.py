from typing import Literal, Optional

from pydantic import BaseModel, Field

from apps.api.app.domains.public_quota.constants import (
    PUBLIC_QUOTA_MODE_DAILY_GLOBAL,
    PUBLIC_QUOTA_MODE_PER_IP,
)

PublicQuotaMode = Literal[PUBLIC_QUOTA_MODE_DAILY_GLOBAL, PUBLIC_QUOTA_MODE_PER_IP]
CLIENT_PROVIDER_URL_POOL_MAX_LENGTH = 8192


class SettingsUpdateRequest(BaseModel):
    site_title: str = Field(min_length=1, max_length=255)
    allow_public_signup: bool
    allow_anonymous_image: bool
    uploads_enabled: bool
    public_quota_mode: Optional[PublicQuotaMode] = None
    public_quota_daily_global_limit: Optional[int] = Field(default=None, ge=1)
    public_quota_per_ip_limit: Optional[int] = Field(default=None, ge=1)
    client_provider_url_pool: Optional[str] = Field(default=None, max_length=CLIENT_PROVIDER_URL_POOL_MAX_LENGTH)
    llm_purpose_model_codes: Optional[dict[str, str]] = None
