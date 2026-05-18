from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

AUDIT_LOG_DEFAULT_PAGE = 1
AUDIT_LOG_DEFAULT_PAGE_SIZE = 25
AUDIT_LOG_MAX_PAGE_SIZE = 100


class AdminActionLogListOptions(BaseModel):
    action: Optional[str] = Field(default=None, min_length=1, max_length=64)
    target_type: Optional[str] = Field(default=None, min_length=1, max_length=64)
    target_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    admin_user_id: Optional[int] = Field(default=None, ge=1)
    created_from: Optional[datetime] = None
    created_to: Optional[datetime] = None
    page: int = Field(default=AUDIT_LOG_DEFAULT_PAGE, ge=1)
    page_size: int = Field(default=AUDIT_LOG_DEFAULT_PAGE_SIZE, ge=1, le=AUDIT_LOG_MAX_PAGE_SIZE)
