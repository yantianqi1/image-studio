import { apiFetch, apiUpload } from "@/lib/api-client";
import { adminAuditApi } from "@/lib/admin-audit-api";
import type { AdminImageJob, ImageJobStats } from "@/lib/admin-image-job-types";
import { adminProviderApi } from "@/lib/admin-provider-api";
import { buildUsersSearch, type AdminUserList, type AdminUsersQuery } from "@/lib/admin-users";
import { adminWorkerApi } from "@/lib/admin-worker-api";

export type { AdminAuditLog, AdminAuditLogList, AdminAuditLogsQuery } from "@/lib/admin-audit-api";
export type { AdminUser, AdminUserList, AdminUsersQuery } from "@/lib/admin-users";
export type { ImageQueueSummary, RunningImageItem, WorkerNode, WorkerSummary } from "@/lib/admin-worker-api";

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

export type AdminDeadLetterItem = Readonly<{
  item_id: number;
  job_id: number;
  result_index: number;
  status: string;
  priority: number;
  prompt: string;
  model_code: string;
  last_error_code: string | null;
  last_error_message: string | null;
  dead_letter_at: string | null;
  manual_retry_count: number;
}>;

export type AdminImageItemActionResult = Readonly<{
  item_id: number;
  job_id: number;
  status: string;
}>;

export type AdminImageJobActionResult = Readonly<{
  job_id: number;
  updated_items: number;
}>;

export type AdminLlmFeatureModel = Readonly<{
  id: number;
  code: string;
  display_name: string;
  capability: string;
  provider_id: number;
  provider_model: string;
  public_enabled: boolean;
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

export type AdminUserStatusUpdateInput = Readonly<{
  status: "active" | "disabled" | "deleted";
  reason: string;
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
  updateUserStatus(userId: number, input: AdminUserStatusUpdateInput) {
    return apiFetch<{ id: number; email: string; display_name: string; status: string; created_at: string }>(
      `/api/admin/users/${userId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },
  ...adminAuditApi,
  ...adminProviderApi,
  ...adminWorkerApi,
  imageJobs() {
    return apiFetch<readonly AdminImageJob[]>("/api/admin/image/jobs");
  },
  imageJobStats() {
    return apiFetch<ImageJobStats>("/api/admin/image/stats");
  },
  deadLetterItems() {
    return apiFetch<{ items: readonly AdminDeadLetterItem[] }>("/api/admin/image/dead-letter-items");
  },
  retryImageItem(itemId: number) {
    return apiFetch<AdminImageItemActionResult>(`/api/admin/image/items/${itemId}/retry`, {
      method: "POST",
    });
  },
  cancelImageItem(itemId: number) {
    return apiFetch<AdminImageItemActionResult>(`/api/admin/image/items/${itemId}/cancel`, {
      method: "POST",
    });
  },
  retryImageJob(jobId: number) {
    return apiFetch<AdminImageJobActionResult>(`/api/admin/image/jobs/${jobId}/retry`, {
      method: "POST",
    });
  },
  cancelImageJob(jobId: number) {
    return apiFetch<AdminImageJobActionResult>(`/api/admin/image/jobs/${jobId}/cancel`, {
      method: "POST",
    });
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
