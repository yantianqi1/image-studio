from typing import Annotated

from pydantic import BaseModel, Field

ReferenceAssetId = Annotated[int, Field(ge=1)]


class CreateImageJobRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model_code: str = Field(min_length=1)
    requested_count: int = Field(default=1, ge=1, le=4)
    mode: str = Field(default="generate", pattern="^(generate|edit)$")
    source_asset_id: int | None = Field(default=None, ge=1)
    reference_asset_ids: list[ReferenceAssetId] = Field(default_factory=list)
    visibility: str = Field(default="private", pattern="^(private|public)$")


class UpdateAssetVisibilityRequest(BaseModel):
    visibility: str = Field(default="private", pattern="^(private|public)$")
