from pydantic import BaseModel, Field, field_validator


class ReservationCreateRequest(BaseModel):
    amount_cents: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=64)


class WalletAdjustmentRequest(BaseModel):
    amount_cents: int
    reason: str = Field(min_length=1, max_length=64)

    @field_validator("amount_cents")
    @classmethod
    def validate_amount_cents(cls, value: int) -> int:
        if value == 0:
            raise ValueError("amount_cents must not be 0")
        return value
