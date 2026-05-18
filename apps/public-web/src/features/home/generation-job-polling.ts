import type {
  ImageGenerationResponse,
  ImageJobResult,
} from "@/lib/public-api";
import type { ApiRequestOptions } from "@/lib/api-client";

const POLL_INTERVAL_MS = 2000;
const HISTORY_STATUS_GENERATING = "generating";
const HISTORY_STATUS_PENDING = "pending";
const HISTORY_STATUS_SUCCESS = "success";
const TERMINAL_FAILED_STATUS = "failed";
const TERMINAL_SUCCEEDED_STATUS = "succeeded";
const MISSING_RESULTS_MESSAGE = "生成任务已完成，但没有返回图片结果";
const QUEUE_HANDOFF_TIMEOUT_MS = 45 * 1000;
const WORKER_HANDOFF_TIMEOUT_MESSAGE = "生成服务暂未接手，请检查 worker 进程或任务队列。";

type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;
type JobUpdateHandler = (job: ImageGenerationResponse) => void;
type ImageJobPollingApi = Readonly<{
  getImageJob: (
    jobId: number,
    options?: Pick<ApiRequestOptions, "signal">,
  ) => Promise<ImageGenerationResponse>;
  getImageJobResults: (
    jobId: number,
    options?: Pick<ApiRequestOptions, "signal">,
  ) => Promise<readonly ImageJobResult[]>;
}>;

type WaitForImageJobOptions = Readonly<{
  onJobUpdate?: JobUpdateHandler;
  signal?: AbortSignal;
  sleep?: Sleep;
}>;

export type CompletedImageJob = Readonly<{
  job: ImageGenerationResponse;
  results: readonly ImageJobResult[];
}>;

export type ResumableImageJobHistory = Readonly<{
  status: string;
  taskId?: number | null;
  images?: readonly unknown[];
}>;

export function shouldResumeImageJobHistory(history: ResumableImageJobHistory | null) {
  if (!history?.taskId) {
    return false;
  }
  if (history.status === HISTORY_STATUS_PENDING || history.status === HISTORY_STATUS_GENERATING) {
    return true;
  }
  return history.status === HISTORY_STATUS_SUCCESS && (history.images?.length ?? 0) === 0;
}

export function imageJobResultsToHistoryImages(results: readonly ImageJobResult[]) {
  return results.map((item) => ({
    id: String(item.id),
    assetId: item.asset_id,
    url: item.asset_url,
    thumbnailUrl: item.thumbnail_url ?? item.asset_url,
    visibility: item.visibility ?? "private",
    publishedAt: item.published_at ?? null,
  }));
}

export async function waitForImageJobResults(
  api: ImageJobPollingApi,
  jobId: number,
  options: WaitForImageJobOptions = {},
): Promise<CompletedImageJob> {
  const sleep = options.sleep ?? defaultSleep;
  while (true) {
    throwIfAborted(options.signal);
    const job = await api.getImageJob(jobId, { signal: options.signal });
    throwIfAborted(options.signal);
    options.onJobUpdate?.(job);
    if (job.status === TERMINAL_FAILED_STATUS) {
      throw new Error(job.error_message || "生成任务失败");
    }
    if (job.status === TERMINAL_SUCCEEDED_STATUS) {
      const results = await api.getImageJobResults(jobId, { signal: options.signal });
      if (results.length === 0) {
        throw new Error(MISSING_RESULTS_MESSAGE);
      }
      return { job, results };
    }
    assertWorkerHandoffIsFresh(job);
    await sleep(POLL_INTERVAL_MS, options.signal);
  }
}

function assertWorkerHandoffIsFresh(job: ImageGenerationResponse) {
  if (job.status !== "queued" || job.started_at) {
    return;
  }
  const queuedAtMs = parseJobTimestamp(job.available_at ?? job.created_at);
  if (queuedAtMs === null) {
    return;
  }
  if (Date.now() - queuedAtMs > QUEUE_HANDOFF_TIMEOUT_MS) {
    throw new Error(WORKER_HANDOFF_TIMEOUT_MESSAGE);
  }
}

function parseJobTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeIsoTimestamp(value);
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizeIsoTimestamp(value: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return `${value}Z`;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("Image job polling aborted", "AbortError");
  }
}

function defaultSleep(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Image job polling aborted", "AbortError"));
    }, { once: true });
  });
}
