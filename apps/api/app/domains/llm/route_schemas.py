from pydantic import BaseModel, Field

class CreateProviderRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    type: str = Field(min_length=1, max_length=64)
    base_url: str | None = Field(default=None, max_length=255)
    api_key_env: str | None = Field(default=None, max_length=128)
    default_model: str | None = Field(default=None, max_length=128)


class CreateSellableModelRequest(BaseModel):
    code: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)
    capability: str = Field(min_length=1, max_length=32)
    provider_id: int = Field(ge=1)
    provider_model: str = Field(min_length=1, max_length=128)
    public_enabled: bool


class UpdateSellableModelRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=128)
    capability: str = Field(min_length=1, max_length=32)
    provider_id: int = Field(ge=1)
    provider_model: str = Field(min_length=1, max_length=128)
    public_enabled: bool


class FetchUpstreamModelsRequest(BaseModel):
    url: str = Field(min_length=1, max_length=512)
    api_key_env: str | None = Field(default=None, max_length=128)


class ImportUpstreamModelsRequest(BaseModel):
    url: str = Field(min_length=1, max_length=512)
    api_key_env: str | None = Field(default=None, max_length=128)
    provider_id: int = Field(ge=1)
    model_ids: list[str] = Field(min_length=1, max_length=100)
    capability: str = Field(min_length=1, max_length=32)
    public_enabled: bool


class LLMFeatureModelUpdateItem(BaseModel):
    feature_key: str = Field(min_length=1, max_length=64)
    model_code: str = Field(min_length=1, max_length=128)


class UpdateLLMFeatureModelsRequest(BaseModel):
    features: list[LLMFeatureModelUpdateItem] = Field(min_length=1, max_length=32)
