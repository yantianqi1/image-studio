from pydantic import BaseModel, Field


class CreateBatchRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    credit_amount_cents: int = Field(gt=0)
    codes: list[str] = Field(min_length=1)


class RedeemRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)

