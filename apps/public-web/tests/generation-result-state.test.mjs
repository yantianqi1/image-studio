import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadResultState() {
  const source = readFileSync(new URL("../src/features/home/generation-result-state.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

const baseHistory = {
  id: "h1",
  title: "dog",
  prompt: "small dog",
  modelCode: "gpt-image-2",
  modelName: "GPT Image 2",
  count: 1,
  aspectRatio: "1:1",
  status: "generating",
  images: [],
  taskId: 11,
  taskStatus: "queued",
  createdAt: "2026-04-25T08:00:00.000Z",
  updatedAt: "2026-04-25T08:00:00.000Z",
};

test("deriveResultView maps queued task to waiting queue UI", () => {
  const { deriveResultView } = loadResultState();
  const view = deriveResultView(baseHistory, { status: "submitting" });

  assert.equal(view.kind, "queued");
  assert.equal(view.badgeLabel, "等待处理");
  assert.equal(view.activeStep, "queue");
});

test("deriveResultView maps running task to generating UI", () => {
  const { deriveResultView } = loadResultState();
  const view = deriveResultView({ ...baseHistory, taskStatus: "running" }, { status: "submitting" });

  assert.equal(view.kind, "generating");
  assert.equal(view.badgeLabel, "生成中");
  assert.equal(view.activeStep, "generate");
});

test("deriveResultView maps succeeded task without images to writeback waiting UI", () => {
  const { deriveResultView } = loadResultState();
  const view = deriveResultView({ ...baseHistory, status: "success", taskStatus: "succeeded" }, { status: "success", jobId: 11, taskStatus: "succeeded" });

  assert.equal(view.kind, "success_without_images");
  assert.equal(view.badgeLabel, "处理中");
  assert.equal(view.activeStep, "writeback");
});
