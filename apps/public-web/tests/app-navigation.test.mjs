import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const appShellSource = readFileSync(new URL("../src/features/shell/app-shell.tsx", import.meta.url), "utf8");

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

test("app navigation features 图库 before 生图", () => {
  const { APP_HEADER_CONTAINER_CLASS, APP_HEADER_LEFT_CLASS, APP_HEADER_RIGHT_CLASS, APP_MOBILE_NAV_CONTAINER_CLASS, APP_NAV_CONTAINER_CLASS, APP_NAV_ITEMS } = loadAppNavigation();

  assert.equal(APP_NAV_ITEMS.length, 7);
  assert.equal(APP_NAV_ITEMS[0].label, "图库");
  assert.equal(APP_NAV_ITEMS[0].href, "/");
  assert.equal(APP_NAV_ITEMS[0].tone, "featured");
  assert.equal(APP_NAV_ITEMS[1].label, "生图");
  assert.equal(APP_NAV_ITEMS[1].href, "/generate");
  assert.equal(APP_NAV_ITEMS[2].label, "漫画");
  assert.equal(APP_NAV_ITEMS[3].label, "应用");
  assert.equal(APP_NAV_ITEMS[4].label, "任务");
  assert.equal(APP_NAV_ITEMS[5].label, "钱包");
  assert.equal(APP_NAV_ITEMS[6].label, "登录");
  assert.match(APP_HEADER_CONTAINER_CLASS, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(APP_HEADER_CONTAINER_CLASS, /md:grid-cols-\[minmax\(0,1fr\)_31rem_minmax\(0,1fr\)\]/);
  assert.match(APP_HEADER_LEFT_CLASS, /col-start-1/);
  assert.match(APP_HEADER_RIGHT_CLASS, /md:col-start-3/);
  assert.match(APP_NAV_CONTAINER_CLASS, /grid-cols-7/);
  assert.match(APP_MOBILE_NAV_CONTAINER_CLASS, /md:hidden/);
  assert.match(APP_MOBILE_NAV_CONTAINER_CLASS, /grid-cols-7/);
  assert.match(appShellSource, /nav-pill-featured/);
  assert.doesNotMatch(APP_NAV_CONTAINER_CLASS, /absolute/);
});

test("app shell renders a mobile module switch below the header row", () => {
  assert.match(appShellSource, /<MobileNav activeHref=\{props\.activeHref\} \/>/);
  assert.match(appShellSource, /function MobileNav/);
});
