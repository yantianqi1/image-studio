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
