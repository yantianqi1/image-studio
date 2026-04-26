import type {
  ImageGenerationResponse,
  ImageJobResult,
  PublicApiClient,
} from "@/lib/public-api";

const POLL_INTERVAL_MS = 2000;
const TERMINAL_FAILED_STATUS = "failed";
const TERMINAL_SUCCEEDED_STATUS = "succeeded";

type Sleep = (milliseconds: number) => Promise<void>;

export type CompletedImageJob = Readonly<{
  job: ImageGenerationResponse;
  results: readonly ImageJobResult[];
}>;

export async function waitForImageJobResults(
  api: Pick<PublicApiClient, "getImageJob" | "getImageJobResults">,
  jobId: number,
  sleep: Sleep = defaultSleep,
): Promise<CompletedImageJob> {
  while (true) {
    const job = await api.getImageJob(jobId);
    if (job.status === TERMINAL_FAILED_STATUS) {
      throw new Error(job.error_message || "生成任务失败");
    }
    if (job.status === TERMINAL_SUCCEEDED_STATUS) {
      const results = await api.getImageJobResults(jobId);
      return { job, results };
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
