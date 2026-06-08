import type {
  ImageGenerationResponse,
  ImageJobItem,
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
const MISSING_PARTIAL_RESULTS_MESSAGE = "生成任务收到单张完成事件，但没有返回图片结果";
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;
const ITEM_STATE_EVENT_NAMES = [
  "item_failed",
  "item_cancelled",
  "item_retry_scheduled",
] as const;

type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;
type JobUpdateHandler = (job: ImageGenerationResponse) => void;
type ResultsUpdateHandler = (results: readonly ImageJobResult[]) => void;
type ItemsUpdateHandler = (items: readonly ImageJobItem[]) => void;
type ImageJobEventSource = {
  addEventListener: (name: string, handler: (event: MessageEvent) => void) => void;
  close: () => void;
  onerror: ((event: Event) => void) | null;
};
type EventSourceFactory = (url: string) => ImageJobEventSource;
type ImageJobPollingApi = Readonly<{
  getImageJob: (
    jobId: number,
    options?: Pick<ApiRequestOptions, "signal">,
  ) => Promise<ImageGenerationResponse>;
  getImageJobResults: (
    jobId: number,
    options?: Pick<ApiRequestOptions, "signal">,
  ) => Promise<readonly ImageJobResult[]>;
  getImageJobItems: (
    jobId: number,
    options?: Pick<ApiRequestOptions, "signal">,
  ) => Promise<readonly ImageJobItem[]>;
}>;

type WaitForImageJobOptions = Readonly<{
  onJobUpdate?: JobUpdateHandler;
  onResultsUpdate?: ResultsUpdateHandler;
  onItemsUpdate?: ItemsUpdateHandler;
  signal?: AbortSignal;
  sleep?: Sleep;
  eventSourceFactory?: EventSourceFactory;
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
  const sseResult = await waitForImageJobResultsWithSSE(api, jobId, options);
  if (sseResult) {
    return sseResult;
  }
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
    await emitItemsUpdate(api, jobId, options);
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

async function waitForImageJobResultsWithSSE(
  api: ImageJobPollingApi,
  jobId: number,
  options: WaitForImageJobOptions,
): Promise<CompletedImageJob | null> {
  const factory = resolveEventSourceFactory(options);
  if (!factory) {
    return null;
  }
  return new Promise<CompletedImageJob | null>((resolve, reject) => {
    const source = factory(`/api/public/image/jobs/${jobId}/events`);
    let pendingResultsUpdate = Promise.resolve();
    let pendingItemsUpdate = Promise.resolve();
    const close = () => source.close();
    const rejectStream = (error: unknown) => {
      close();
      reject(error);
    };
    const scheduleItemsUpdate = () => {
      pendingItemsUpdate = pendingItemsUpdate.then(() => emitItemsUpdate(api, jobId, options));
      pendingItemsUpdate.catch(rejectStream);
    };
    options.signal?.addEventListener("abort", () => {
      close();
      reject(new DOMException("Image job polling aborted", "AbortError"));
    }, { once: true });
    source.onerror = () => {
      close();
      resolve(null);
    };
    source.addEventListener("job_snapshot", (event) => {
      options.onJobUpdate?.(parseJobEvent(event));
      scheduleItemsUpdate();
    });
    source.addEventListener("item_started", (event) => {
      options.onJobUpdate?.(parseJobEvent(event));
      scheduleItemsUpdate();
    });
    addItemStateListeners(source, scheduleItemsUpdate);
    source.addEventListener("item_succeeded", () => {
      pendingResultsUpdate = pendingResultsUpdate.then(() => emitPartialResults(api, jobId, options));
      pendingResultsUpdate.catch(rejectStream);
    });
    source.addEventListener("job_failed", async (event) => {
      close();
      try {
        await pendingResultsUpdate;
        await pendingItemsUpdate;
        await emitItemsUpdate(api, jobId, options);
        reject(new Error(parseJobEvent(event).error_message || "生成任务失败"));
      } catch (error) {
        reject(error);
      }
    });
    source.addEventListener("job_succeeded", async (event) => {
      close();
      try {
        await pendingResultsUpdate;
        await pendingItemsUpdate;
        await emitItemsUpdate(api, jobId, options);
        const job = parseJobEvent(event);
        options.onJobUpdate?.(job);
        resolve({ job, results: await loadCompletedResults(api, jobId, options.signal) });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function addItemStateListeners(source: ImageJobEventSource, onItemStateChange: () => void) {
  for (const eventName of ITEM_STATE_EVENT_NAMES) {
    source.addEventListener(eventName, onItemStateChange);
  }
}

async function emitPartialResults(
  api: ImageJobPollingApi,
  jobId: number,
  options: WaitForImageJobOptions,
) {
  throwIfAborted(options.signal);
  const results = await api.getImageJobResults(jobId, { signal: options.signal });
  throwIfAborted(options.signal);
  if (results.length === 0) {
    throw new Error(MISSING_PARTIAL_RESULTS_MESSAGE);
  }
  options.onResultsUpdate?.(results);
  await emitItemsUpdate(api, jobId, options);
}

async function emitItemsUpdate(
  api: ImageJobPollingApi,
  jobId: number,
  options: WaitForImageJobOptions,
) {
  if (!options.onItemsUpdate) {
    return;
  }
  throwIfAborted(options.signal);
  const items = await api.getImageJobItems(jobId, { signal: options.signal });
  throwIfAborted(options.signal);
  options.onItemsUpdate(items);
}

function resolveEventSourceFactory(options: WaitForImageJobOptions): EventSourceFactory | null {
  if (options.eventSourceFactory) {
    return options.eventSourceFactory;
  }
  if (typeof EventSource === "undefined") {
    return null;
  }
  return (url) => new EventSource(url);
}

async function loadCompletedResults(
  api: ImageJobPollingApi,
  jobId: number,
  signal: AbortSignal | undefined,
): Promise<readonly ImageJobResult[]> {
  const results = await api.getImageJobResults(jobId, { signal });
  if (results.length === 0) {
    throw new Error(MISSING_RESULTS_MESSAGE);
  }
  return results;
}

function parseJobEvent(event: MessageEvent): ImageGenerationResponse {
  return JSON.parse(event.data) as ImageGenerationResponse;
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
