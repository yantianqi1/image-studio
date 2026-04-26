import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadWorkflowEvents() {
  const source = readFileSync("apps/public-web/src/features/comic/comic-workflow-events.ts", "utf8");
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

test("workflow events describe each real comic workflow stage", () => {
  const { WORKFLOW_EVENT_MESSAGES } = loadWorkflowEvents();

  for (const key of [
    "submit_project",
    "project_created",
    "task_queued",
    "task_started",
    "story_analyzing",
    "character_designing",
    "storyboarding",
    "prompt_composing",
    "reference_generating",
    "page_generating",
    "completed",
    "failed",
  ]) {
    assert.ok(WORKFLOW_EVENT_MESSAGES[key], `${key} event missing`);
  }
});
