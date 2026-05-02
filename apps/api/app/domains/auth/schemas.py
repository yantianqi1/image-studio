from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

ADMIN_USER_DEFAULT_PAGE = 1
ADMIN_USER_DEFAULT_PAGE_SIZE = 25
ADMIN_USER_MAX_PAGE_SIZE = 100


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=255)


class LoginRequest(RegisterRequest):
    pass


class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=6, max_length=255)


class AdminUserListOptions(BaseModel):
    q: Optional[str] = Field(default=None, min_length=1, max_length=255)
    status: Optional[str] = Field(default=None, min_length=1, max_length=32)
    page: int = Field(default=ADMIN_USER_DEFAULT_PAGE, ge=1)
    page_size: int = Field(default=ADMIN_USER_DEFAULT_PAGE_SIZE, ge=1, le=ADMIN_USER_MAX_PAGE_SIZE)
