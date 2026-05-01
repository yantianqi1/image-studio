import type {
  ImageGenerationResponse,
  ImageJobResult,
  PublicApiClient,
} from "@/lib/public-api";

const POLL_INTERVAL_MS = 2000;
const HISTORY_STATUS_GENERATING = "generating";
const HISTORY_STATUS_PENDING = "pending";
const HISTORY_STATUS_SUCCESS = "success";
const TERMINAL_FAILED_STATUS = "failed";
const TERMINAL_SUCCEEDED_STATUS = "succeeded";
const MISSING_RESULTS_MESSAGE = "生成任务已完成，但没有返回图片结果";

type Sleep = (milliseconds: number) => Promise<void>;
type JobUpdateHandler = (job: ImageGenerationResponse) => void;

type WaitForImageJobOptions = Readonly<{
  onJobUpdate?: JobUpdateHandler;
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
    visibility: item.visibility ?? "private",
    publishedAt: item.published_at ?? null,
  }));
}

export async function waitForImageJobResults(
  api: Pick<PublicApiClient, "getImageJob" | "getImageJobResults">,
  jobId: number,
  options: WaitForImageJobOptions = {},
): Promise<CompletedImageJob> {
  const sleep = options.sleep ?? defaultSleep;
  while (true) {
    const job = await api.getImageJob(jobId);
    options.onJobUpdate?.(job);
    if (job.status === TERMINAL_FAILED_STATUS) {
      throw new Error(job.error_message || "生成任务失败");
    }
    if (job.status === TERMINAL_SUCCEEDED_STATUS) {
      const results = await api.getImageJobResults(jobId);
      if (results.length === 0) {
        throw new Error(MISSING_RESULTS_MESSAGE);
      }
      return { job, results };
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
