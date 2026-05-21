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
  const sandbox = { DOMException, Error, exports: {}, module: { exports: {} } };
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

test("waitForImageJobResults uses SSE before polling when event source works", async () => {
  const { waitForImageJobResults } = loadPolling();
  const source = new FakeEventSource();
  const api = {
    async getImageJob() {
      throw new Error("polling should not start when SSE succeeds");
    },
    async getImageJobResults(jobId) {
      return [{ id: 9, job_id: jobId, asset_url: "/api/public/image/assets/9" }];
    },
  };

  const completedPromise = waitForImageJobResults(api, 11, {
    eventSourceFactory: () => source,
  });
  source.emit("job_succeeded", { id: 11, status: "succeeded" });
  const completed = await completedPromise;

  assert.equal(completed.job.status, "succeeded");
  assert.equal(completed.results.length, 1);
  assert.equal(source.closed, true);
});

test("waitForImageJobResults falls back to polling when SSE errors", async () => {
  const { waitForImageJobResults } = loadPolling();
  const source = new FakeEventSource();
  let pollCount = 0;
  const api = {
    async getImageJob(jobId) {
      pollCount += 1;
      return { id: jobId, status: "succeeded", error_message: null };
    },
    async getImageJobResults(jobId) {
      return [{ id: 10, job_id: jobId, asset_url: "/api/public/image/assets/10" }];
    },
  };

  const completedPromise = waitForImageJobResults(api, 12, {
    eventSourceFactory: () => source,
    sleep: async () => undefined,
  });
  source.emitError();
  const completed = await completedPromise;

  assert.equal(completed.job.status, "succeeded");
  assert.equal(pollCount, 1);
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

test("waitForImageJobResults keeps polling queued jobs without worker handoff errors", async () => {
  const { waitForImageJobResults } = loadPolling();
  const staleCreatedAt = new Date(Date.now() - 8 * 60 * 1000).toISOString().replace(/Z$/, "");
  let pollCount = 0;
  const api = {
    async getImageJob(jobId) {
      pollCount += 1;
      if (pollCount === 2) {
        return { id: jobId, status: "succeeded", created_at: staleCreatedAt, started_at: staleCreatedAt, error_message: null };
      }
      return { id: jobId, status: "queued", created_at: staleCreatedAt, started_at: null, error_message: null };
    },
    async getImageJobResults() {
      return [{ id: 1, job_id: 14, result_index: 1, asset_id: 2, asset_url: "/asset/2" }];
    },
  };

  const completed = await waitForImageJobResults(api, 14, { sleep: async () => undefined });

  assert.equal(completed.job.status, "succeeded");
  assert.equal(completed.results.length, 1);
});

test("waitForImageJobResults stops polling when aborted during sleep", async () => {
  const { waitForImageJobResults } = loadPolling();
  const controller = new AbortController();
  let requestCount = 0;
  const api = {
    async getImageJob(jobId) {
      requestCount += 1;
      return { id: jobId, status: "running", error_message: null };
    },
    async getImageJobResults() {
      throw new Error("should not fetch results for running job");
    },
  };

  await assert.rejects(
    () => waitForImageJobResults(api, 99, {
      signal: controller.signal,
      sleep: async () => controller.abort(),
    }),
    /aborted/i,
  );
  assert.equal(requestCount, 1);
});

test("imageJobResultsToHistoryImages keeps thumbnail urls for grid previews", () => {
  const { imageJobResultsToHistoryImages } = loadPolling();
  const images = imageJobResultsToHistoryImages([{
    id: 9,
    asset_id: 19,
    asset_url: "/api/public/image/assets/19",
    thumbnail_url: "/api/public/image/assets/19/thumbnail",
    visibility: "private",
    published_at: null,
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(images)), [{
    id: "9",
    assetId: 19,
    url: "/api/public/image/assets/19",
    thumbnailUrl: "/api/public/image/assets/19/thumbnail",
    visibility: "private",
    publishedAt: null,
  }]);
});

test("shouldResumeImageJobHistory ignores terminal failed history with a task id", () => {
  const { shouldResumeImageJobHistory } = loadPolling();

  assert.equal(shouldResumeImageJobHistory({ status: "failed", taskId: 78, images: [] }), false);
});

test("shouldResumeImageJobHistory ignores completed history with images", () => {
  const { shouldResumeImageJobHistory } = loadPolling();

  assert.equal(shouldResumeImageJobHistory({ status: "success", taskId: 78, images: [{ id: "1" }] }), false);
});

class FakeEventSource {
  handlers = new Map();
  closed = false;
  addEventListener(name, handler) {
    this.handlers.set(name, handler);
  }
  close() {
    this.closed = true;
  }
  emit(name, data) {
    this.handlers.get(name)?.({ data: JSON.stringify(data) });
  }
  emitError() {
    this.onerror?.(new Error("sse failed"));
  }
}
