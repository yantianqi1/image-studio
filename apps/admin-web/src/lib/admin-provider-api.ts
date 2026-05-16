import { apiFetch } from "@/lib/api-client";

export type ModelVariant = Readonly<{
  id: number;
  model_id: number;
  size: string;
  quality: string;
  upstream_provider_model: string | null;
  upstream_cost_credits: number | null;
  upstream_cost_cents: number | null;
  member_price_credits: number | null;
  member_price_cents: number;
  anonymous_price_cents: number;
  profit_margin_basis_points: number;
  price_manually_set: boolean;
  status: string;
  created_at: string | null;
}>;

export type VariantSlot = Readonly<{
  quality: string;
  id: number | null;
  upstream_provider_model: string | null;
  upstream_cost_credits: number | null;
  upstream_cost_cents: number | null;
  member_price_credits: number | null;
  member_price_cents: number | null;
  anonymous_price_cents: number | null;
  profit_margin_basis_points: number | null;
  status: string | null;
}>;

export type VariantTier = Readonly<{
  tier: string;
  size: string;
  variants: readonly VariantSlot[];
}>;

export type VariantMatrixGroup = Readonly<{
  aspect_ratio: string;
  tiers: readonly VariantTier[];
}>;

export type VariantMatrix = Readonly<{
  model_id: number;
  groups: readonly VariantMatrixGroup[];
}>;

export type BatchVariantInput = {
  size: string;
  quality: string;
  upstream_provider_model?: string | null;
  upstream_cost_credits?: number | null;
  upstream_cost_cents?: number | null;
  profit_margin_basis_points: number;
  member_price_cents: number;
  anonymous_price_cents: number;
  status: string;
};

export type ApplyDefaultPricingResult = Readonly<{
  updated: number;
  skipped: number;
  total: number;
  variants: readonly ModelVariant[];
}>;

export const adminProviderApi = {
  providers() {
    return apiFetch<readonly ProviderPayload[]>("/api/admin/providers");
  },
  createProvider(input: CreateProviderInput) {
    return apiFetch<ProviderPayload>("/api/admin/providers", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  deleteProvider(providerId: number) {
    return apiFetch<{ deleted: boolean }>(`/api/admin/providers/${providerId}`, {
      method: "DELETE",
    });
  },
  models() {
    return apiFetch<readonly SellableModelPayload[]>("/api/admin/models");
  },
  createModel(input: CreateSellableModelInput) {
    return apiFetch<SellableModelPayload>("/api/admin/models", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateModel(modelCode: string, input: SellableModelInput) {
    return apiFetch<SellableModelPayload>(`/api/admin/models/${encodeURIComponent(modelCode)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteModel(modelCode: string) {
    return apiFetch<{ deleted: boolean }>(`/api/admin/models/${encodeURIComponent(modelCode)}`, {
      method: "DELETE",
    });
  },
  modelVariants(modelId: number) {
    return apiFetch<readonly ModelVariant[]>(`/api/admin/models/${modelId}/variants`);
  },
  createModelVariant(modelId: number, input: CreateModelVariantInput) {
    return apiFetch<ModelVariant>(`/api/admin/models/${modelId}/variants`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateModelVariant(modelId: number, variantId: number, input: UpdateModelVariantInput) {
    return apiFetch<ModelVariant>(`/api/admin/models/${modelId}/variants/${variantId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  deleteModelVariant(modelId: number, variantId: number) {
    return apiFetch<{ deleted: boolean }>(`/api/admin/models/${modelId}/variants/${variantId}`, {
      method: "DELETE",
    });
  },
  variantMatrix(modelId: number) {
    return apiFetch<VariantMatrix>(`/api/admin/models/${modelId}/variant-matrix`);
  },
  batchUpsertVariants(modelId: number, input: { variants: BatchVariantInput[] }) {
    return apiFetch<readonly ModelVariant[]>(`/api/admin/models/${modelId}/variants/batch`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  applyDefaultPricing(modelId: number, input: { force: boolean; profit_margin_basis_points?: number }) {
    return apiFetch<ApplyDefaultPricingResult>(`/api/admin/models/${modelId}/variants/apply-default-pricing`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  fetchUpstreamModels(input: { url: string; api_key_env?: string }) {
    return apiFetch<readonly { id: string; display_name: string }[]>("/api/admin/models/upstream", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  importUpstreamModels(input: ImportUpstreamModelsInput) {
    return apiFetch<readonly SellableModelPayload[]>("/api/admin/models/import-upstream", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

type ProviderPayload = Readonly<{
  id: number;
  name: string;
  type: string;
  base_url: string | null;
  api_key_env: string | null;
  default_model: string | null;
  status: string;
}>;

type CreateProviderInput = Readonly<{
  name: string;
  type: string;
  base_url?: string;
  api_key_env?: string;
  default_model?: string;
}>;

type SellableModelPayload = Readonly<{
  id: number;
  code: string;
  display_name: string;
  capability: string;
  provider_id: number;
  provider_model: string;
  public_enabled: boolean;
  member_price_credits?: number;
  member_price_cents: number;
  anonymous_price_cents: number;
}>;

type SellableModelInput = Readonly<{
  display_name: string;
  capability: string;
  provider_id: number;
  provider_model: string;
  public_enabled: boolean;
  member_price_cents: number;
  anonymous_price_cents: number;
}>;

type CreateSellableModelInput = SellableModelInput & Readonly<{
  code: string;
}>;

type CreateModelVariantInput = Readonly<{
  size: string;
  quality: string;
  upstream_provider_model?: string;
  upstream_cost_credits?: number | null;
  upstream_cost_cents?: number | null;
  profit_margin_basis_points?: number;
  member_price_cents: number;
  anonymous_price_cents: number;
}>;

type UpdateModelVariantInput = Readonly<{
  upstream_provider_model?: string | null;
  upstream_cost_credits?: number | null;
  upstream_cost_cents?: number | null;
  profit_margin_basis_points?: number;
  member_price_cents: number;
  anonymous_price_cents: number;
  status: string;
}>;

type ImportUpstreamModelsInput = Readonly<{
  url: string;
  api_key_env?: string;
  provider_id: number;
  model_ids: string[];
  capability: string;
  public_enabled: boolean;
  member_price_cents: number;
  anonymous_price_cents: number;
}>;
