import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadStorage() {
  const source = readFileSync(
    new URL("../src/features/home/generation-history-storage.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    Date,
    console,
    crypto: { randomUUID: () => "history-id" },
    exports: {},
    module: { exports: {} },
    require(moduleName) {
      if (moduleName === "@/features/home/generation-history.types") {
        return {
          GENERATION_HISTORY_STORAGE_KEY: "test_generation_history",
          MAX_GENERATION_HISTORY_ITEMS: 50,
        };
      }
      throw new Error(`Unexpected require: ${moduleName}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

function buildHistory(patch = {}) {
  return {
    id: "h1",
    title: "Prompt",
    prompt: "Prompt",
    modelCode: "model",
    modelName: "Model",
    count: 1,
    aspectRatio: "1:1",
    status: "pending",
    images: [],
    sourceImage: null,
    referenceImages: [],
    errorMessage: null,
    taskId: 42,
    taskStatus: "queued",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

test("updateGenerationHistory returns the same array for no-op patches", () => {
  const { updateGenerationHistory } = loadStorage();
  const histories = [buildHistory({ status: "generating", taskStatus: "running" })];
  const next = updateGenerationHistory(histories, "h1", {
    status: "generating",
    taskId: histories[0].taskId,
    taskStatus: "running",
  });

  assert.equal(next, histories);
  assert.equal(next[0], histories[0]);
});

test("updateGenerationHistory updates updatedAt only when values change", () => {
  const { updateGenerationHistory } = loadStorage();
  const histories = [buildHistory({ status: "pending", taskStatus: "queued" })];
  const next = updateGenerationHistory(histories, "h1", { status: "generating" });

  assert.notEqual(next, histories);
  assert.equal(next[0].status, "generating");
  assert.notEqual(next[0].updatedAt, histories[0].updatedAt);
});
