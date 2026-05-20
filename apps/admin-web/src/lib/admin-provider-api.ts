import { apiFetch } from "@/lib/api-client";

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
  syncNewApiModels() {
    return apiFetch<readonly SellableModelPayload[]>("/api/admin/models/sync-newapi", {
      method: "POST",
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
}>;

type SellableModelInput = Readonly<{
  display_name: string;
  capability: string;
  provider_id: number;
  provider_model: string;
  public_enabled: boolean;
}>;

type CreateSellableModelInput = SellableModelInput & Readonly<{
  code: string;
}>;

type ImportUpstreamModelsInput = Readonly<{
  url: string;
  api_key_env?: string;
  provider_id: number;
  model_ids: string[];
  capability: string;
  public_enabled: boolean;
}>;
