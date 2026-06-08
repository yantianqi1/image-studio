import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadStudioPolling() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-job-polling.ts", import.meta.url),
    "utf8",
  );
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

test("waitForImageJobResults keeps polling a queued studio job without worker handoff errors", async () => {
  const { waitForImageJobResults } = loadStudioPolling();
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
      return [{ id: 1, job_id: 15, result_index: 1, asset_id: 2, asset_url: "/asset/2" }];
    },
  };

  const completed = await waitForImageJobResults(api, 15, { sleep: async () => undefined });

  assert.equal(completed.job.status, "succeeded");
  assert.equal(completed.results.length, 1);
});

test("waitForImageJobResults uses SSE before polling in studio", async () => {
  const { waitForImageJobResults } = loadStudioPolling();
  const source = new FakeEventSource();
  const api = {
    async getImageJob() {
      throw new Error("polling should not start when SSE succeeds");
    },
    async getImageJobResults(jobId) {
      return [{ id: 1, job_id: jobId, result_index: 1, asset_id: 2, asset_url: "/asset/2" }];
    },
  };

  const completedPromise = waitForImageJobResults(api, 15, {
    eventSourceFactory: () => source,
  });
  source.emit("job_succeeded", { id: 15, status: "succeeded" });
  const completed = await completedPromise;

  assert.equal(completed.job.status, "succeeded");
  assert.equal(completed.results.length, 1);
  assert.equal(source.closed, true);
});

test("waitForImageJobResults emits partial results from SSE item success", async () => {
  const { waitForImageJobResults } = loadStudioPolling();
  const source = new FakeEventSource();
  const partialUpdates = [];
  const itemUpdates = [];
  let resultCall = 0;
  let itemCall = 0;
  const api = {
    async getImageJob() {
      throw new Error("polling should not start when SSE succeeds");
    },
    async getImageJobResults(jobId) {
      resultCall += 1;
      if (resultCall === 1) {
        return [{ id: 1, job_id: jobId, result_index: 1, asset_id: 2, asset_url: "/asset/2" }];
      }
      return [
        { id: 1, job_id: jobId, result_index: 1, asset_id: 2, asset_url: "/asset/2" },
        { id: 2, job_id: jobId, result_index: 2, asset_id: 3, asset_url: "/asset/3" },
      ];
    },
    async getImageJobItems(jobId) {
      itemCall += 1;
      return [
        { id: 6, job_id: jobId, result_index: 1, status: "succeeded" },
        { id: 7, job_id: jobId, result_index: 2, status: itemCall > 1 ? "succeeded" : "running" },
      ];
    },
  };

  const completedPromise = waitForImageJobResults(api, 15, {
    eventSourceFactory: () => source,
    onItemsUpdate: (items) => itemUpdates.push(items.map((item) => item.status)),
    onResultsUpdate: (results) => partialUpdates.push(results.map((result) => result.asset_url)),
  });
  source.emit("item_succeeded", { id: 15, status: "running", item_id: 6, asset_id: 2 });
  await Promise.resolve();
  source.emit("job_succeeded", { id: 15, status: "succeeded" });
  const completed = await completedPromise;

  assert.deepEqual(partialUpdates[0], ["/asset/2"]);
  assert.deepEqual(itemUpdates[0], ["succeeded", "running"]);
  assert.deepEqual(itemUpdates.at(-1), ["succeeded", "succeeded"]);
  assert.equal(completed.results.length, 2);
});

test("waitForImageJobResults emits item updates from SSE item state changes", async () => {
  const { waitForImageJobResults } = loadStudioPolling();
  const source = new FakeEventSource();
  const itemUpdates = [];
  const api = {
    async getImageJob() {
      throw new Error("polling should not start when SSE succeeds");
    },
    async getImageJobResults(jobId) {
      return [{ id: 2, job_id: jobId, result_index: 1, asset_id: 3, asset_url: "/asset/3" }];
    },
    async getImageJobItems(jobId) {
      return [{ id: 7, job_id: jobId, result_index: 1, status: "failed", error_message: "blocked" }];
    },
  };

  const completedPromise = waitForImageJobResults(api, 15, {
    eventSourceFactory: () => source,
    onItemsUpdate: (items) => itemUpdates.push(items.map((item) => item.status)),
  });
  source.emit("item_failed", { id: 15, status: "failed", item_id: 7 });
  await Promise.resolve();
  source.emit("job_succeeded", { id: 15, status: "succeeded" });
  await completedPromise;

  assert.deepEqual(itemUpdates[0], ["failed"]);
});

test("waitForImageJobResults keeps item started as a job update", async () => {
  const { waitForImageJobResults } = loadStudioPolling();
  const source = new FakeEventSource();
  const jobUpdates = [];
  const api = {
    async getImageJob() {
      throw new Error("polling should not start when SSE succeeds");
    },
    async getImageJobResults(jobId) {
      return [{ id: 2, job_id: jobId, result_index: 1, asset_id: 3, asset_url: "/asset/3" }];
    },
    async getImageJobItems(jobId) {
      return [{ id: 7, job_id: jobId, result_index: 1, status: "running" }];
    },
  };

  const completedPromise = waitForImageJobResults(api, 15, {
    eventSourceFactory: () => source,
    onJobUpdate: (job) => jobUpdates.push(job.status),
    onItemsUpdate: () => undefined,
  });
  source.emit("item_started", { id: 15, status: "running", item_id: 7 });
  await Promise.resolve();
  source.emit("job_succeeded", { id: 15, status: "succeeded" });
  await completedPromise;

  assert.deepEqual(jobUpdates.slice(0, 2), ["running", "succeeded"]);
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
}
