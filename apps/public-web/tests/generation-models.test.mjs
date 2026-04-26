import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadGenerationModels() {
  const source = readFileSync(new URL("../src/features/home/generation-models.ts", import.meta.url), "utf8");
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

test("filterImageModels keeps only real image models and removes local placeholder", () => {
  const { filterImageModels } = loadGenerationModels();
  const models = [
    { code: "local-dev-image", capability: "image" },
    { code: "gemini-3-flash-preview-low-search", capability: "chat" },
    { code: "gpt-image-2", capability: "image" },
  ];

  assert.deepEqual(filterImageModels(models).map((model) => model.code), ["gpt-image-2"]);
});
