import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadTurnProgress() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-turn-progress.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    Event,
    exports: {},
    module: { exports: {} },
    window: { dispatchEvent: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("turn progress snapshots use fresh map references for React state updates", () => {
  const { clearTurnProgress, getTurnProgressSnapshot, setTurnProgress } = loadTurnProgress();
  const key = "conv:turn";
  clearTurnProgress(key);

  const before = getTurnProgressSnapshot();
  setTurnProgress(key, { message: "正在合规化改写..." });
  const after = getTurnProgressSnapshot();

  assert.notEqual(before, after);
  assert.equal(after.get(key)?.message, "正在合规化改写...");
});
