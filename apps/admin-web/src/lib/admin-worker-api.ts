import { apiFetch } from "@/lib/api-client";

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

export type WorkerNode = Readonly<{
  id: string;
  worker_name: string;
  hostname: string | null;
  version: string | null;
  status: string;
  mode: string;
  concurrency: number;
  started_at: string | null;
  last_heartbeat_at: string | null;
  metadata: Record<string, unknown>;
}>;

export type ImageQueueSummary = Readonly<{
  items: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    dead_letter: number;
  };
  stale_running: number;
  generated_at: string;
}>;

export type RunningImageItem = Readonly<{
  item_id: number;
  job_id: number;
  result_index: number;
  model_code: string;
  provider_id: number | null;
  locked_by: string | null;
  attempt_count: number;
  max_attempts: number;
  started_at: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
}>;

export const adminWorkerApi = {
  workerSummary() {
    return apiFetch<WorkerSummary>("/api/admin/ops/worker-summary");
  },
  workerNodes() {
    return apiFetch<{ items: readonly WorkerNode[] }>("/api/admin/ops/workers");
  },
  queueSummary() {
    return apiFetch<ImageQueueSummary>("/api/admin/ops/image/queue-summary");
  },
  runningItems() {
    return apiFetch<{ items: readonly RunningImageItem[] }>("/api/admin/ops/image/running-items");
  },
  drainWorker(workerId: string) {
    return apiFetch<WorkerNode>(`/api/admin/ops/workers/${encodeURIComponent(workerId)}/drain`, {
      method: "POST",
    });
  },
  resumeWorker(workerId: string) {
    return apiFetch<WorkerNode>(`/api/admin/ops/workers/${encodeURIComponent(workerId)}/resume`, {
      method: "POST",
    });
  },
};
