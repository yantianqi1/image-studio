import { apiFetch } from "@/lib/api-client";
import type { AdminImageJob } from "@/lib/admin-image-job-types";

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
  users() {
    return apiFetch<readonly { id: number; email: string; display_name: string; status: string }[]>(
      "/api/admin/auth/users",
    );
  },
  wallet(userId: number) {
    return apiFetch<{ balance_cents: number; locked_cents: number; currency: string }>(
      `/api/admin/billing/wallets/${userId}`,
    );
  },
  walletLedger(userId: number) {
    return apiFetch<
      readonly {
        id: number;
        amount_cents: number;
        balance_after_cents: number;
        reason: string;
        reference_type: string;
        reference_id: string;
        created_at: string;
      }[]
    >(`/api/admin/billing/wallets/${userId}/ledger`);
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
  workerSummary() {
    return apiFetch<WorkerSummary>("/api/admin/ops/worker-summary");
  },
  comicTasks() {
    return apiFetch<readonly { id: string; task_type: string; status: string; created_at: string }[]>(
      "/api/admin/comic/tasks",
    );
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
  }) {
    return apiFetch<{
      site_title: string;
      allow_public_signup: boolean;
      allow_anonymous_image: boolean;
      uploads_enabled: boolean;
      public_quota_mode: "daily_global" | "per_ip";
      public_quota_daily_global_limit: number;
      public_quota_per_ip_limit: number;
    }>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
};
