import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadResultsScrollModule() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-results-scroll.ts", import.meta.url),
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

test("studio results stay pinned when the latest turn layout grows near the composer", () => {
  const { shouldScrollResultsToBottom } = loadResultsScrollModule();

  assert.equal(shouldScrollResultsToBottom({
    hasLayoutChanged: true,
    hasNewTurn: false,
    previousViewport: {
      clientHeight: 640,
      scrollHeight: 1200,
      scrollTop: 560,
    },
  }), true);
});

test("studio results do not force scroll when the user is reading older turns", () => {
  const { shouldScrollResultsToBottom } = loadResultsScrollModule();

  assert.equal(shouldScrollResultsToBottom({
    hasLayoutChanged: true,
    hasNewTurn: false,
    previousViewport: {
      clientHeight: 640,
      scrollHeight: 1200,
      scrollTop: 120,
    },
  }), false);
});
