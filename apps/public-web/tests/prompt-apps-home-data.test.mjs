import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPromptAppsHomeData() {
  const source = readFileSync(new URL("../src/features/prompt-apps/prompt-apps-home-data.ts", import.meta.url), "utf8");
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

test("buildPromptAppCenterCards keeps the prompt app card data intact", () => {
  const { buildPromptAppCenterCards } = loadPromptAppsHomeData();
  const cards = buildPromptAppCenterCards([
    {
      cover: {
        badge: "海报",
        imageSrc: "/app-covers/character-poster-hutao.png",
        label: "角色海报",
      },
      description: "输入角色与备注，生成二次元动漫插画海报。",
      href: "/apps/character-poster",
      statusLabel: "内置提示词",
      title: "角色海报",
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].title, "角色海报");
  assert.equal(cards[0].href, "/apps/character-poster");
  assert.equal(cards[0].statusLabel, "内置提示词");
  assert.deepEqual(cards[0].cover, {
    badge: "海报",
    imageSrc: "/app-covers/character-poster-hutao.png",
    label: "角色海报",
  });
});
