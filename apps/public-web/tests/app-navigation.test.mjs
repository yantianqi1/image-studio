import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadAppNavigation() {
  const source = readFileSync(new URL("../src/features/shell/app-navigation.ts", import.meta.url), "utf8");
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

test("app navigation exposes 应用 after 生图", () => {
  const { APP_NAV_ITEMS } = loadAppNavigation();

  assert.equal(APP_NAV_ITEMS.length, 6);
  assert.equal(APP_NAV_ITEMS[0].label, "生图");
  assert.equal(APP_NAV_ITEMS[1].label, "应用");
  assert.equal(APP_NAV_ITEMS[2].label, "漫画");
  assert.equal(APP_NAV_ITEMS[3].label, "任务");
  assert.equal(APP_NAV_ITEMS[4].label, "钱包");
  assert.equal(APP_NAV_ITEMS[5].label, "登录");
  assert.equal(APP_NAV_ITEMS[1].href, "/apps");
});
