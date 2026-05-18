from datetime import datetime
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_REDEEM_BATCH_QUANTITY = 1000
MAX_REDEEM_PREFIX_LENGTH = 24
MAX_REDEEM_NOTE_LENGTH = 500
MAX_REDEEM_REASON_LENGTH = 255
PREFIX_PATTERN = re.compile(r"^[A-Z0-9]+(?:-[A-Z0-9]+)*$")


class CreateBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=128)
    credit_amount_cents: int = Field(gt=0)
    quantity: int = Field(ge=1, le=MAX_REDEEM_BATCH_QUANTITY)
    prefix: str | None = Field(default=None, max_length=MAX_REDEEM_PREFIX_LENGTH)
    expires_at: datetime | None = None
    note: str = Field(default="", max_length=MAX_REDEEM_NOTE_LENGTH)
    reason: str = Field(min_length=1, max_length=MAX_REDEEM_REASON_LENGTH)

    @field_validator("prefix")
    @classmethod
    def validate_prefix(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            return None
        if PREFIX_PATTERN.fullmatch(normalized) is None:
            raise ValueError("prefix must contain uppercase letters, digits, or hyphens")
        return normalized

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str) -> str:
        return value.strip()

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        return validate_reason_text(value)


class DisableBatchRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=MAX_REDEEM_REASON_LENGTH)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        return validate_reason_text(value)


class DisableCodeRequest(DisableBatchRequest):
    pass


class RedeemRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)


def validate_reason_text(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("reason is required")
    return stripped
