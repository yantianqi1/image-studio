import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/features/jobs/image-jobs-page.tsx", import.meta.url),
  "utf8",
);
const logListSource = readFileSync(
  new URL("../src/features/jobs/image-job-log-list.tsx", import.meta.url),
  "utf8",
);
const dataHookSource = readFileSync(
  new URL("../src/lib/use-admin-data.ts", import.meta.url),
  "utf8",
);
const statsSource = readFileSync(
  new URL("../src/features/jobs/image-job-stats.tsx", import.meta.url),
  "utf8",
);
const imageJobTypesSource = readFileSync(
  new URL("../src/lib/admin-image-job-types.ts", import.meta.url),
  "utf8",
);
const adminApiSource = readFileSync(
  new URL("../src/lib/admin-api.ts", import.meta.url),
  "utf8",
);
const adminWorkerApiSource = readFileSync(
  new URL("../src/lib/admin-worker-api.ts", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/features/jobs/image-jobs.css", import.meta.url),
  "utf8",
);
const workerRuntimeSource = readFileSync(
  new URL("../src/features/jobs/image-worker-runtime-panel.tsx", import.meta.url),
  "utf8",
);

test("image jobs page uses dense row log layout", () => {
  assert.match(pageSource, /ImageJobLogList/);
  assert.doesNotMatch(pageSource, /ImageJobSidebar|ImageJobDetail|ImageJobResults/);
  assert.match(logListSource, /PromptCell/);
  assert.match(logListSource, /DetailCell/);
  assert.match(logListSource, /PreviewCell/);
  assert.match(styleSource, /grid-template-columns: minmax\(260px, 1\.35fr\) minmax\(380px, 1\.6fr\) 180px/);
});

test("image jobs page supports manual and automatic refresh", () => {
  assert.match(pageSource, /自动刷新 5 秒/);
  assert.match(pageSource, /onRefresh=\{\(\) => mutateJobs\(\)\}/);
  assert.match(dataHookSource, /const IMAGE_JOBS_REFRESH_INTERVAL_MS = 5000/);
  assert.match(dataHookSource, /refreshInterval: IMAGE_JOBS_REFRESH_INTERVAL_MS/);
});

test("image job rows expose upstream cost and preview fields", () => {
  assert.match(logListSource, /label: "上游成本"/);
  assert.match(logListSource, /label: "中转费用"/);
  assert.match(logListSource, /label: "内部成本"/);
  assert.doesNotMatch(logListSource, /label: "扣费"|label: "毛利"/);
  assert.match(imageJobTypesSource, /thumbnail_url: string/);
  assert.match(logListSource, /href=\{result\.asset_url\}/);
  assert.match(logListSource, /src=\{result\.thumbnail_url\}/);
  assert.doesNotMatch(logListSource, /src=\{result\.asset_url\}/);
  assert.match(styleSource, /object-fit: contain/);
});

test("image jobs page exposes dead letter and queue recovery actions", () => {
  assert.match(pageSource, /dead-letter/);
  assert.match(pageSource, /死信队列/);
  assert.match(logListSource, /retryImageJob/);
  assert.match(logListSource, /cancelImageJob/);
  assert.match(adminApiSource, /retryImageItem/);
  assert.match(adminApiSource, /cancelImageItem/);
});

test("image jobs page exposes worker summary and real drain controls", () => {
  assert.match(pageSource, /ImageWorkerRuntimePanel/);
  assert.match(workerRuntimeSource, /Worker runtime/);
  assert.match(pageSource, /useImageQueueSummary/);
  assert.match(pageSource, /useRunningImageItems/);
  assert.match(pageSource, /drainWorker/);
  assert.match(pageSource, /resumeWorker/);
  assert.match(workerRuntimeSource, /Drain/);
  assert.match(workerRuntimeSource, /Resume/);
  assert.match(workerRuntimeSource, /RunningItems/);
  assert.match(adminWorkerApiSource, /queueSummary/);
  assert.match(adminWorkerApiSource, /runningItems/);
  assert.match(adminWorkerApiSource, /drainWorker/);
  assert.match(adminWorkerApiSource, /resumeWorker/);
});

test("image job stats exposes cutover operations metrics", () => {
  assert.match(imageJobTypesSource, /operations: \{/);
  assert.match(imageJobTypesSource, /outbox_pending_oldest_age_seconds: number \| null/);
  assert.match(statsSource, /事件积压/);
  assert.match(statsSource, /stats\.operations\.outbox_pending_oldest_age_seconds/);
});
