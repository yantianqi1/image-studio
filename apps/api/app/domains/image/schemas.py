from pydantic import BaseModel, Field


class CreateImageJobRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model_code: str = Field(min_length=1)
    requested_count: int = Field(default=1, ge=1, le=4)
    mode: str = Field(default="generate", pattern="^(generate|edit)$")
    source_asset_id: int | None = Field(default=None, ge=1)
