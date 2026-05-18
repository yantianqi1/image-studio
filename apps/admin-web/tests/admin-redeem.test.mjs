import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const redeemCreatePanelSource = readFileSync(
  new URL("../src/features/redeem/redeem-create-batch-panel.tsx", import.meta.url),
  "utf8",
);

function loadRedeemModule() {
  const source = readFileSync(new URL("../src/lib/admin-redeem.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("redeem batch expiry keeps datetime-local value without UTC conversion", () => {
  const { normalizeRedeemBatchExpiresAt } = loadRedeemModule();

  assert.equal(normalizeRedeemBatchExpiresAt("2026-06-30T23:59"), "2026-06-30T23:59");
  assert.equal(normalizeRedeemBatchExpiresAt("   "), null);
  assert.equal(normalizeRedeemBatchExpiresAt(null), null);
});

test("redeem page does not convert datetime-local input through Date", () => {
  assert.match(redeemCreatePanelSource, /normalizeRedeemBatchExpiresAt/);
  assert.doesNotMatch(redeemCreatePanelSource, /toISOString/);
});
