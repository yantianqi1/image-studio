import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadComicState() {
  const source = readFileSync(new URL("../src/features/comic/comic-state.ts", import.meta.url), "utf8");
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

const project = { id: "proj_1", title: "Demo", status: "draft", updated_at: "2026-04-25T00:00:00.000Z" };

test("project without comic tasks is not treated as LLM planning", () => {
  const { deriveComicWorkspaceStatus } = loadComicState();
  const status = deriveComicWorkspaceStatus(
    { status: "ready", data: [project] },
    { status: "ready", data: [] },
    "idle",
  );

  assert.equal(status, "project_created_no_task");
});

test("queued or running comic task is treated as real processing", () => {
  const { deriveComicWorkspaceStatus } = loadComicState();
  const queuedStatus = deriveComicWorkspaceStatus(
    { status: "ready", data: [project] },
    { status: "ready", data: [{ id: "task_1", status: "queued" }] },
    "idle",
  );
  const stagedStatus = deriveComicWorkspaceStatus(
    { status: "ready", data: [project] },
    { status: "ready", data: [{ id: "task_2", status: "running", stage: "storyboarding" }] },
    "idle",
  );

  assert.equal(queuedStatus, "task_queued");
  assert.equal(stagedStatus, "storyboarding");
});

test("failed comic task surfaces failed workspace state", () => {
  const { deriveComicWorkspaceStatus } = loadComicState();
  const status = deriveComicWorkspaceStatus(
    { status: "ready", data: [project] },
    { status: "ready", data: [{ id: "task_1", status: "failed", error_message: "LLM rejected schema" }] },
    "idle",
  );

  assert.equal(status, "failed");
});
