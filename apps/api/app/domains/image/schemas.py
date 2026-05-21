from typing import Annotated

from pydantic import BaseModel, Field

ReferenceAssetId = Annotated[int, Field(ge=1)]


class ImageConversationContentPart(BaseModel):
    type: str = Field(pattern="^(text|image_asset)$")
    text: str | None = Field(default=None, min_length=1)
    asset_id: int | None = Field(default=None, ge=1)


class ImageConversationMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str | list[ImageConversationContentPart]


class CreateImageJobRequest(BaseModel):
    prompt: str = Field(min_length=1)
    model_code: str = Field(min_length=1)
    requested_count: int = Field(default=1, ge=1, le=4)
    mode: str = Field(default="generate", pattern="^(generate|edit)$")
    size: str | None = Field(default=None)
    quality: str | None = Field(default=None, pattern="^(low|medium|high)$")
    source_asset_id: int | None = Field(default=None, ge=1)
    reference_asset_ids: list[ReferenceAssetId] = Field(default_factory=list)
    character_library_ids: list[ReferenceAssetId] = Field(default_factory=list)
    conversation_messages: list[ImageConversationMessage] = Field(default_factory=list)
    visibility: str = Field(default="private", pattern="^(private|public)$")
    auto_title: bool = False


class UpdateAssetVisibilityRequest(BaseModel):
    visibility: str = Field(default="private", pattern="^(private|public)$")


class UpdateImageJobPriorityRequest(BaseModel):
    priority: int
