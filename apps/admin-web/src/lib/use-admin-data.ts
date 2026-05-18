import useSWR from "swr";

import type { AdminImageJob } from "@/lib/admin-image-job-types";
import type { AdminUserList, AdminUsersQuery } from "@/lib/admin-users";
import type {
  AdminAuditLogList,
  AdminGalleryItem,
  AdminLlmFacilityResponse,
  AdminRedeemBatchCode,
  AdminRedeemBatchDetail,
  AdminRedeemBatchSummary,
  WorkerSummary,
} from "@/lib/admin-api";
import type { ImageJobStats } from "@/lib/admin-image-job-types";

function buildSearch(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

type PaginatedJobs = {
  items: readonly AdminImageJob[];
  total: number;
  page: number;
  page_size: number;
};

export type AdminComicTask = Readonly<{
  id: string;
  project_id: string;
  chapter_id: string | null;
  scene_id: string | null;
  task_type: string;
  status: string;
  stage: string;
  progress_percent: number;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}>;

const IMAGE_JOBS_REFRESH_INTERVAL_MS = 5000;
const WORKER_SUMMARY_REFRESH_INTERVAL_MS = 15000;
const COMIC_TASKS_REFRESH_INTERVAL_MS = 15000;

export function useAdminJobs(params: { page?: number; page_size?: number; status?: string } = {}) {
  const search = buildSearch({ ...params, paginated: 1 });
  return useSWR<PaginatedJobs>(`/api/admin/image/jobs${search}`, {
    refreshInterval: IMAGE_JOBS_REFRESH_INTERVAL_MS,
  });
}

export function useWorkerSummary() {
  return useSWR<WorkerSummary>("/api/admin/ops/worker-summary", {
    refreshInterval: WORKER_SUMMARY_REFRESH_INTERVAL_MS,
  });
}

export function useAdminStats() {
  return useSWR<ImageJobStats>("/api/admin/image/stats", {
    refreshInterval: IMAGE_JOBS_REFRESH_INTERVAL_MS,
  });
}

export function useAdminComicTasks() {
  return useSWR<readonly AdminComicTask[]>("/api/admin/comic/tasks", {
    refreshInterval: COMIC_TASKS_REFRESH_INTERVAL_MS,
  });
}

export function useLlmFacilities() {
  return useSWR<AdminLlmFacilityResponse>("/api/admin/llm/features");
}

export function useAdminUsers(query: AdminUsersQuery = {}) {
  const search = buildSearch({
    q: query.q,
    status: query.status,
    page: query.page,
    page_size: query.pageSize,
  });
  return useSWR<AdminUserList>(`/api/admin/users${search}`);
}

type GalleryData = {
  items: readonly AdminGalleryItem[];
  total: number;
  page: number;
  page_size: number;
};

export function useAdminGallery(params: { page?: number; page_size?: number; q?: string } = {}) {
  return useSWR<GalleryData>(`/api/admin/gallery${buildSearch(params)}`);
}

type Provider = {
  id: number;
  name: string;
  type: string;
  base_url: string | null;
  api_key_env: string | null;
  default_model: string | null;
  status: string;
};

type SellableModel = {
  id: number;
  code: string;
  display_name: string;
  capability: string;
  provider_id: number;
  provider_model: string;
  public_enabled: boolean;
  member_price_cents: number;
  anonymous_price_cents: number;
};

export function useProviders() {
  return useSWR<readonly Provider[]>("/api/admin/providers");
}

export function useModels() {
  return useSWR<readonly SellableModel[]>("/api/admin/models");
}

type RedeemCode = {
  id: number;
  code: string;
  credit_amount_cents: number;
  credit_amount_credits: number;
  status: string;
  redeemed_by_user_id: number | null;
  redeemed_at: string | null;
  created_at: string;
};

export function useRedeemCodes() {
  return useSWR<readonly RedeemCode[]>("/api/admin/redeem/codes");
}

export function useRedeemBatches() {
  return useSWR<readonly AdminRedeemBatchSummary[]>("/api/admin/redeem/batches");
}

export function useRedeemBatch(batchId: number | null) {
  return useSWR<AdminRedeemBatchDetail>(batchId ? `/api/admin/redeem/batches/${batchId}` : null);
}

export function useRedeemBatchCodes(batchId: number | null) {
  return useSWR<readonly AdminRedeemBatchCode[]>(batchId ? `/api/admin/redeem/batches/${batchId}/codes` : null);
}

export function useAdminAuditLogs(query: {
  action?: string;
  target_type?: string;
  target_id?: string;
  admin_user_id?: number;
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
} | null = {}) {
  return useSWR<AdminAuditLogList>(query ? `/api/admin/audit-logs${buildSearch(query)}` : null);
}

type SiteSettings = {
  site_title: string;
  allow_public_signup: boolean;
  allow_anonymous_image: boolean;
  uploads_enabled: boolean;
  public_quota_mode: "daily_global" | "per_ip";
  public_quota_daily_global_limit: number;
  public_quota_per_ip_limit: number;
  client_provider_url_pool: string;
};

export function useAdminSettings() {
  return useSWR<SiteSettings>("/api/admin/settings");
}
