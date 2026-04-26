import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadAspectRatioModule() {
  const source = readFileSync(new URL("../src/features/home/generation-aspect-ratio.ts", import.meta.url), "utf8");
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

test("buildAspectRatioPrompt appends selected ratio instruction", () => {
  const { buildAspectRatioPrompt } = loadAspectRatioModule();
  const prompt = buildAspectRatioPrompt("画一只小狗", "16:9");

  assert.match(prompt, /画一只小狗/);
  assert.match(prompt, /尺寸与构图要求/);
  assert.match(prompt, /16:9 横向宽屏比例/);
});

test("buildAspectRatioPrompt trims prompt and skips unknown ratio", () => {
  const { buildAspectRatioPrompt } = loadAspectRatioModule();

  assert.equal(buildAspectRatioPrompt("  画一只小狗  ", "unknown"), "画一只小狗");
});
