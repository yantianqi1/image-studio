import { apiFetch, apiUpload } from "@/lib/api-client";
import type { AdminImageJob, ImageJobStats } from "@/lib/admin-image-job-types";
import { adminProviderApi } from "@/lib/admin-provider-api";
import { buildUsersSearch, type AdminUserList, type AdminUsersQuery, type AdminWallet, type AdminWalletLedgerEntry } from "@/lib/admin-users";

export type {
  ApplyDefaultPricingResult,
  BatchVariantInput,
  ModelVariant,
  VariantMatrix,
  VariantMatrixGroup,
} from "@/lib/admin-provider-api";
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

export type AdminCharacterLibraryUpdateInput = Readonly<{
  file: File | null;
  name: string;
}>;

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

export type AdminLlmFeatureModel = Readonly<{
  id: number;
  code: string;
  display_name: string;
  capability: string;
  provider_id: number;
  provider_model: string;
  public_enabled: boolean;
  member_price_cents: number;
  anonymous_price_cents: number;
}>;

export type AdminLlmFeatureSetting = Readonly<{
  feature_key: string;
  display_name: string;
  description: string;
  input_mode: "text" | "image" | "multimodal";
  required_capabilities: readonly string[];
  default_model_code: string;
  model_code: string | null;
  model: AdminLlmFeatureModel | null;
}>;

export type AdminLlmFacilityResponse = Readonly<{
  features: readonly AdminLlmFeatureSetting[];
  models: readonly AdminLlmFeatureModel[];
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
    return apiFetch<{ id: number; name: string; credit_amount_cents: number; credit_amount_credits: number }>("/api/admin/redeem/batches", {
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
        credit_amount_credits: number;
        status: string;
        redeemed_by_user_id: number | null;
        redeemed_at: string | null;
      }[]
    >("/api/admin/redeem/codes");
  },
  ...adminProviderApi,
  imageJobs() {
    return apiFetch<readonly AdminImageJob[]>("/api/admin/image/jobs");
  },
  imageJobStats() {
    return apiFetch<ImageJobStats>("/api/admin/image/stats");
  },
  llmFacilities() {
    return apiFetch<AdminLlmFacilityResponse>("/api/admin/llm/features");
  },
  updateLlmFacilities(input: { features: readonly { feature_key: string; model_code: string }[] }) {
    return apiFetch<AdminLlmFacilityResponse>("/api/admin/llm/features", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
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
  updateCharacterLibraryItem(characterId: number, input: AdminCharacterLibraryUpdateInput) {
    const formData = new FormData();
    formData.append("name", input.name);
    if (input.file) {
      formData.append("file", input.file);
    }
    return apiUpload<AdminCharacterLibraryItem>(`/api/admin/character-library/${characterId}`, formData, {
      method: "PATCH",
    });
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
