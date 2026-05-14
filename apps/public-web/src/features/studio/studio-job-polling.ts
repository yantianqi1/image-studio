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
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

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
  const startedAt = Date.now();
  while (true) {
    throwIfAborted(options.signal);
    if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
      throw new Error("生成超时，请重试");
    }
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
    await sleep(POLL_INTERVAL_MS, options.signal);
  }
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
