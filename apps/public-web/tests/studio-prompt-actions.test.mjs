import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPromptActions() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-prompt-actions.ts", import.meta.url),
    "utf8",
  );
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

test("prompt optimization instruction requires one best prompt only", () => {
  const { buildPromptOptimizationInstruction } = loadPromptActions();
  const instruction = buildPromptOptimizationInstruction("未来城市海报");

  assert.match(instruction, /只选择一种最优视觉方案/);
  assert.match(instruction, /禁止输出多个方案、备选方案、方案一、方案二、列表或分支选项/);
  assert.match(instruction, /最终只输出一段完整的纯提示词/);
});
