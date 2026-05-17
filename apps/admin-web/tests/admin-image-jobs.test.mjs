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
const imageJobTypesSource = readFileSync(
  new URL("../src/lib/admin-image-job-types.ts", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/features/jobs/image-jobs.css", import.meta.url),
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
  assert.match(pageSource, /自动刷新 5s/);
  assert.match(pageSource, /onRefresh=\{\(\) => mutateJobs\(\)\}/);
  assert.match(dataHookSource, /const IMAGE_JOBS_REFRESH_INTERVAL_MS = 5000/);
  assert.match(dataHookSource, /refreshInterval: IMAGE_JOBS_REFRESH_INTERVAL_MS/);
});

test("image job rows expose cost and preview fields", () => {
  assert.match(logListSource, /label: "扣费"/);
  assert.match(logListSource, /label: "成本"/);
  assert.match(logListSource, /label: "毛利"/);
  assert.match(imageJobTypesSource, /thumbnail_url: string/);
  assert.match(logListSource, /href=\{result\.asset_url\}/);
  assert.match(logListSource, /src=\{result\.thumbnail_url\}/);
  assert.doesNotMatch(logListSource, /src=\{result\.asset_url\}/);
  assert.match(styleSource, /object-fit: contain/);
});
