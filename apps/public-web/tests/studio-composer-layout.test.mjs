import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadComposerLayoutModule() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-composer-layout.ts", import.meta.url),
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

test("fixed composer height is reserved even on wide workspaces", () => {
  const { resolveFixedComposerHeight } = loadComposerLayoutModule();

  assert.equal(resolveFixedComposerHeight({
    position: "fixed",
    top: 948,
    viewportHeight: 1156,
  }), 208);
});

test("static composer does not reserve overlay space", () => {
  const { resolveFixedComposerHeight } = loadComposerLayoutModule();

  assert.equal(resolveFixedComposerHeight({
    position: "static",
    top: 948,
    viewportHeight: 1156,
  }), 0);
});
