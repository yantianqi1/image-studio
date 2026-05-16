from pydantic import BaseModel, Field

from apps.api.app.domains.llm.default_pricing import DEFAULT_PROFIT_MARGIN_BASIS_POINTS


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
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0)


class UpdateSellableModelRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=128)
    capability: str = Field(min_length=1, max_length=32)
    provider_id: int = Field(ge=1)
    provider_model: str = Field(min_length=1, max_length=128)
    public_enabled: bool
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0)


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
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0)


class CreateModelVariantRequest(BaseModel):
    size: str = Field(min_length=1, max_length=64)
    quality: str = Field(min_length=1, max_length=32, pattern="^(low|medium|high)$")
    upstream_provider_model: str | None = Field(default=None, max_length=128)
    upstream_cost_credits: float | None = Field(default=None, ge=0)
    upstream_cost_cents: int | None = Field(default=None, ge=0)
    profit_margin_basis_points: int = Field(default=DEFAULT_PROFIT_MARGIN_BASIS_POINTS, ge=0)
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0, default=0)


class UpdateModelVariantRequest(BaseModel):
    upstream_provider_model: str | None = Field(default=None, max_length=128)
    upstream_cost_credits: float | None = Field(default=None, ge=0)
    upstream_cost_cents: int | None = Field(default=None, ge=0)
    profit_margin_basis_points: int = Field(default=DEFAULT_PROFIT_MARGIN_BASIS_POINTS, ge=0)
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0, default=0)
    status: str = Field(default="active", pattern="^(active|disabled)$")


class BatchVariantItem(BaseModel):
    size: str = Field(min_length=1, max_length=64)
    quality: str = Field(pattern="^(low|medium|high)$")
    upstream_provider_model: str | None = Field(default=None, max_length=128)
    upstream_cost_credits: float | None = Field(default=None, ge=0)
    upstream_cost_cents: int | None = Field(default=None, ge=0)
    profit_margin_basis_points: int = Field(default=DEFAULT_PROFIT_MARGIN_BASIS_POINTS, ge=0)
    member_price_cents: int = Field(ge=0)
    anonymous_price_cents: int = Field(ge=0, default=0)
    status: str = Field(default="active", pattern="^(active|disabled)$")


class BatchUpsertVariantsRequest(BaseModel):
    variants: list[BatchVariantItem] = Field(min_length=1, max_length=84)


class ApplyDefaultPricingRequest(BaseModel):
    force: bool = Field(default=False)
    profit_margin_basis_points: int = Field(default=DEFAULT_PROFIT_MARGIN_BASIS_POINTS, ge=0)
