import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const appShellSource = readFileSync(new URL("../src/features/shell/app-shell.tsx", import.meta.url), "utf8");
const studioPageSource = readFileSync(
  new URL("../src/features/studio/studio-page.tsx", import.meta.url),
  "utf8",
);

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

test("app navigation features 图库 before 创作台", () => {
  const { APP_MOBILE_NAV_ITEMS, APP_NAV_ITEMS } = loadAppNavigation();

  assert.equal(APP_NAV_ITEMS.length, 4);
  assert.equal(APP_NAV_ITEMS[0].label, "图库");
  assert.equal(APP_NAV_ITEMS[0].href, "/");
  assert.equal(APP_NAV_ITEMS[1].label, "创作台");
  assert.equal(APP_NAV_ITEMS[1].href, "/generate");
  assert.equal(APP_NAV_ITEMS[2].label, "漫画");
  assert.equal(APP_NAV_ITEMS[3].label, "应用");
  assert.equal(
    APP_MOBILE_NAV_ITEMS.map((item) => item.label).join(","),
    "图库,创作台,漫画,我的",
  );
  assert.doesNotMatch(
    APP_MOBILE_NAV_ITEMS.map((item) => item.label).join(","),
    /任务|钱包|登录/,
  );
  assert.match(appShellSource, /ProviderSettingsPopover/);
  assert.doesNotMatch(appShellSource, /CreateAction/);
  assert.doesNotMatch(appShellSource, /\+ 生成/);
  assert.doesNotMatch(appShellSource, /OpenAI 兼容 URL/);
  assert.doesNotMatch(appShellSource, /API Key/);
});

test("app shell renders a mobile module switch below the header row", () => {
  assert.match(appShellSource, /<MobileNav activeHref=\{props\.activeHref\} \/>/);
  assert.match(appShellSource, /function MobileNav/);
});

test("product header uses Image Studio as the public brand", () => {
  assert.match(appShellSource, /brandLabel = "Image Studio"/);
  assert.doesNotMatch(studioPageSource, /brandLabel=\{getSiteTitle/);
});

test("app shell avoids unavailable React ViewTransition runtime export", () => {
  assert.doesNotMatch(appShellSource, /import \{ ViewTransition \} from "react"/);
  assert.doesNotMatch(appShellSource, /<ViewTransition/);
});
