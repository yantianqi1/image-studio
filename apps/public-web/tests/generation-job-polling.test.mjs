import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPolling() {
  const source = readFileSync(new URL("../src/features/home/generation-job-polling.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { Error, exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("waitForImageJobResults polls until succeeded and returns image results", async () => {
  const { waitForImageJobResults } = loadPolling();
  const statuses = ["queued", "running", "succeeded"];
  const seenSleeps = [];
  const seenStatuses = [];
  const api = {
    async getImageJob(jobId) {
      return { id: jobId, status: statuses.shift(), error_message: null };
    },
    async getImageJobResults(jobId) {
      return [{ id: 9, job_id: jobId, asset_url: "/api/public/image/assets/9" }];
    },
  };

  const completed = await waitForImageJobResults(api, 11, {
    sleep: async (milliseconds) => {
      seenSleeps.push(milliseconds);
    },
    onJobUpdate: (job) => {
      seenStatuses.push(job.status);
    },
  });

  assert.equal(completed.job.status, "succeeded");
  assert.deepEqual(completed.results.map((result) => result.asset_url), ["/api/public/image/assets/9"]);
  assert.deepEqual(seenSleeps, [2000, 2000]);
  assert.deepEqual(seenStatuses, ["queued", "running", "succeeded"]);
});

test("waitForImageJobResults surfaces terminal failure", async () => {
  const { waitForImageJobResults } = loadPolling();
  const api = {
    async getImageJob(jobId) {
      return { id: jobId, status: "failed", error_message: "provider rejected" };
    },
    async getImageJobResults() {
      throw new Error("should not fetch results for failed job");
    },
  };

  await assert.rejects(
    () => waitForImageJobResults(api, 12, { sleep: async () => undefined }),
    /provider rejected/,
  );
});

test("waitForImageJobResults exposes succeeded job without result rows", async () => {
  const { waitForImageJobResults } = loadPolling();
  const api = {
    async getImageJob(jobId) {
      return { id: jobId, status: "succeeded", error_message: null };
    },
    async getImageJobResults() {
      return [];
    },
  };

  await assert.rejects(
    () => waitForImageJobResults(api, 13, { sleep: async () => undefined }),
    /生成任务已完成，但没有返回图片结果/,
  );
});

test("shouldResumeImageJobHistory ignores terminal failed history with a task id", () => {
  const { shouldResumeImageJobHistory } = loadPolling();

  assert.equal(shouldResumeImageJobHistory({ status: "failed", taskId: 78, images: [] }), false);
});

test("shouldResumeImageJobHistory ignores completed history with images", () => {
  const { shouldResumeImageJobHistory } = loadPolling();

  assert.equal(shouldResumeImageJobHistory({ status: "success", taskId: 78, images: [{ id: "1" }] }), false);
});
