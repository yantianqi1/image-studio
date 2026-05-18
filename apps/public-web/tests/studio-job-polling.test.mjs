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

test("waitForImageJobResults reports a queued studio job that was not claimed by the worker", async () => {
  const { waitForImageJobResults } = loadStudioPolling();
  const staleCreatedAt = new Date(Date.now() - 8 * 60 * 1000).toISOString().replace(/Z$/, "");
  const api = {
    async getImageJob(jobId) {
      return { id: jobId, status: "queued", created_at: staleCreatedAt, started_at: null, error_message: null };
    },
    async getImageJobResults() {
      throw new Error("should not fetch results for a queued job");
    },
  };

  await assert.rejects(
    () => waitForImageJobResults(api, 15, {
      sleep: async () => {
        throw new Error("queued worker handoff should fail before sleeping");
      },
    }),
    /生成服务暂未接手/,
  );
});
