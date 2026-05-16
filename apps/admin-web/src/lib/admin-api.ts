import { apiFetch, apiUpload } from "@/lib/api-client";
import type { AdminImageJob, ImageJobStats } from "@/lib/admin-image-job-types";
import { buildUsersSearch, type AdminUserList, type AdminUsersQuery, type AdminWallet, type AdminWalletLedgerEntry } from "@/lib/admin-users";

export type { AdminUser, AdminUserList, AdminUsersQuery, AdminWallet, AdminWalletLedgerEntry } from "@/lib/admin-users";

export type AdminGalleryItem = Readonly<{
  asset_id: number;
  asset_url: string;
  thumbnail_url: string;
  visibility: "private" | "public";
  published_at: string | null;
  created_at: string;
  job_id: number;
  result_index: number;
  prompt: string;
  revised_prompt: string | null;
  owner_user_id: number | null;
  owner_anonymous_session_id: number | null;
}>;

export type AdminCharacterLibraryItem = Readonly<{
  id: number;
  name: string;
  asset_id: number;
  asset_url: string;
  thumbnail_url: string;
  visibility: "private" | "public";
  owner_user_id: number | null;
  created_at: string;
}>;

export type AdminCharacterLibraryDeleteResult = Readonly<{
  deleted: boolean;
  id: number;
}>;

export type ModelVariant = Readonly<{
  id: number;
  model_id: number;
  size: string;
  quality: string;
  upstream_provider_model: string | null;
  member_price_cents: number;
  anonymous_price_cents: number;
  status: string;
  created_at: string | null;
}>;

export type VariantSlot = Readonly<{
  quality: string;
  id: number | null;
  upstream_provider_model: string | null;
  member_price_cents: number | null;
  anonymous_price_cents: number | null;
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
  member_price_cents: number;
  anonymous_price_cents: number;
  status: string;
};

export type WorkerSummary = Readonly<{
  image_jobs: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    stale_running: number;
    stale_after_seconds: number;
  };
  alerts: readonly {
    code: string;
    level: string;
    message: string;
    count: number;
    threshold: number;
  }[];
}>;

export const adminApi = {
  login(input: { username: string; password: string }) {
    return apiFetch<{ username: string; role: string }>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  me() {
    return apiFetch<{ username: string; role: string }>("/api/admin/auth/me");
  },
  logout() {
    return apiFetch<{ logged_out: boolean }>("/api/admin/auth/logout", {
      method: "POST",
    });
  },
  users(query: AdminUsersQuery = {}) {
    const search = buildUsersSearch(query);
    return apiFetch<AdminUserList>(`/api/admin/users${search}`);
  },
  wallet(userId: number) {
    return apiFetch<AdminWallet>(`/api/admin/billing/wallets/${userId}`);
  },
  walletLedger(userId: number) {
    return apiFetch<readonly AdminWalletLedgerEntry[]>(`/api/admin/billing/wallets/${userId}/ledger`);
  },
  adjustWallet(userId: number, input: { amount_cents: number; reason: string }) {
    return apiFetch<{ balance_cents: number; locked_cents: number; currency: string }>(
      `/api/admin/billing/wallets/${userId}/adjustments`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  createRedeemBatch(input: { name: string; credit_amount_cents: number; codes: string[] }) {
    return apiFetch<{ id: number; name: string; credit_amount_cents: number }>("/api/admin/redeem/batches", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  redeemCodes() {
    return apiFetch<
      readonly {
        id: number;
        code: string;
        credit_amount_cents: number;
        status: string;
        redeemed_by_user_id: number | null;
        redeemed_at: string | null;
      }[]
    >("/api/admin/redeem/codes");
  },
  providers() {
    return apiFetch<
      readonly {
        id: number;
        name: string;
        type: string;
        base_url: string | null;
        api_key_env: string | null;
        default_model: string | null;
        status: string;
      }[]
    >("/api/admin/providers");
  },
  createProvider(input: {
    name: string;
    type: string;
    base_url?: string;
    api_key_env?: string;
    default_model?: string;
  }) {
    return apiFetch<{
      id: number;
      name: string;
      type: string;
      base_url: string | null;
      api_key_env: string | null;
      default_model: string | null;
      status: string;
    }>("/api/admin/providers", {
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
    return apiFetch<
      readonly {
        id: number;
        code: string;
        display_name: string;
        capability: string;
        provider_id: number;
        provider_model: string;
        public_enabled: boolean;
        member_price_cents: number;
        anonymous_price_cents: number;
      }[]
    >("/api/admin/models");
  },
  createModel(input: {
    code: string;
    display_name: string;
    capability: string;
    provider_id: number;
    provider_model: string;
    public_enabled: boolean;
    member_price_cents: number;
    anonymous_price_cents: number;
  }) {
    return apiFetch<{
      id: number;
      code: string;
      display_name: string;
      capability: string;
      provider_id: number;
      provider_model: string;
      public_enabled: boolean;
      member_price_cents: number;
      anonymous_price_cents: number;
    }>("/api/admin/models", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateModel(
    modelCode: string,
    input: {
      display_name: string;
      capability: string;
      provider_id: number;
      provider_model: string;
      public_enabled: boolean;
      member_price_cents: number;
      anonymous_price_cents: number;
    },
  ) {
    return apiFetch<{
      id: number;
      code: string;
      display_name: string;
      capability: string;
      provider_id: number;
      provider_model: string;
      public_enabled: boolean;
      member_price_cents: number;
      anonymous_price_cents: number;
    }>(`/api/admin/models/${encodeURIComponent(modelCode)}`, {
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
  createModelVariant(modelId: number, input: {
    size: string;
    quality: string;
    upstream_provider_model?: string;
    member_price_cents: number;
    anonymous_price_cents: number;
  }) {
    return apiFetch<ModelVariant>(`/api/admin/models/${modelId}/variants`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateModelVariant(modelId: number, variantId: number, input: {
    upstream_provider_model?: string | null;
    member_price_cents: number;
    anonymous_price_cents: number;
    status: string;
  }) {
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
  fetchUpstreamModels(input: { url: string; api_key_env?: string }) {
    return apiFetch<readonly { id: string; display_name: string }[]>(
      "/api/admin/models/upstream",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  importUpstreamModels(input: {
    url: string;
    api_key_env?: string;
    provider_id: number;
    model_ids: string[];
    capability: string;
    public_enabled: boolean;
    member_price_cents: number;
    anonymous_price_cents: number;
  }) {
    return apiFetch<
      readonly {
        id: number;
        code: string;
        display_name: string;
        capability: string;
        provider_id: number;
        provider_model: string;
        public_enabled: boolean;
        member_price_cents: number;
        anonymous_price_cents: number;
      }[]
    >("/api/admin/models/import-upstream", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  imageJobs() {
    return apiFetch<readonly AdminImageJob[]>("/api/admin/image/jobs");
  },
  imageJobStats() {
    return apiFetch<ImageJobStats>("/api/admin/image/stats");
  },
  workerSummary() {
    return apiFetch<WorkerSummary>("/api/admin/ops/worker-summary");
  },
  comicTasks() {
    return apiFetch<readonly { id: string; task_type: string; status: string; created_at: string }[]>(
      "/api/admin/comic/tasks",
    );
  },
  gallery(params: { page?: number; page_size?: number; q?: string } = {}) {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.page_size) search.set("page_size", String(params.page_size));
    if (params.q) search.set("q", params.q);
    const qs = search.toString();
    return apiFetch<{
      items: readonly AdminGalleryItem[];
      total: number;
      page: number;
      page_size: number;
    }>(`/api/admin/gallery${qs ? `?${qs}` : ""}`);
  },
  adminUpdateAssetVisibility(assetId: number, visibility: "private" | "public") {
    return apiFetch<{ asset_id: number; visibility: string }>(`/api/admin/image/assets/${assetId}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    });
  },
  adminDeleteAsset(assetId: number) {
    return apiFetch<{ deleted: boolean; asset_id: number }>(`/api/admin/image/assets/${assetId}`, {
      method: "DELETE",
    });
  },
  characterLibrary() {
    return apiFetch<readonly AdminCharacterLibraryItem[]>("/api/admin/character-library");
  },
  createCharacterLibraryItem(input: { name: string; file: File }) {
    const formData = new FormData();
    formData.append("name", input.name);
    formData.append("file", input.file);
    return apiUpload<AdminCharacterLibraryItem>("/api/admin/character-library", formData);
  },
  deleteCharacterLibraryItem(characterId: number) {
    return apiFetch<AdminCharacterLibraryDeleteResult>(`/api/admin/character-library/${characterId}`, {
      method: "DELETE",
    });
  },
  settings() {
    return apiFetch<{
      site_title: string;
      allow_public_signup: boolean;
      allow_anonymous_image: boolean;
      uploads_enabled: boolean;
      public_quota_mode: "daily_global" | "per_ip";
      public_quota_daily_global_limit: number;
      public_quota_per_ip_limit: number;
      client_provider_url_pool: string;
    }>("/api/admin/settings");
  },
  updateSettings(input: {
    site_title: string;
    allow_public_signup: boolean;
    allow_anonymous_image: boolean;
    uploads_enabled: boolean;
    public_quota_mode: "daily_global" | "per_ip";
    public_quota_daily_global_limit: number;
    public_quota_per_ip_limit: number;
    client_provider_url_pool: string;
  }) {
    return apiFetch<{
      site_title: string;
      allow_public_signup: boolean;
      allow_anonymous_image: boolean;
      uploads_enabled: boolean;
      public_quota_mode: "daily_global" | "per_ip";
      public_quota_daily_global_limit: number;
      public_quota_per_ip_limit: number;
      client_provider_url_pool: string;
    }>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
};
