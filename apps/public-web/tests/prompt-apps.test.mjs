import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPromptApps() {
  const source = readFileSync(new URL("../src/features/prompt-apps/prompt-apps.ts", import.meta.url), "utf8");
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

test("prompt app catalog exposes character poster app", () => {
  const { PROMPT_APPS } = loadPromptApps();

  assert.deepEqual(Array.from(PROMPT_APPS, (app) => app.id), ["character-poster"]);
  assert.equal(PROMPT_APPS[0].title, "角色海报");
  assert.equal(PROMPT_APPS[0].href, "/apps/character-poster");
  assert.equal(PROMPT_APPS[0].cover.label, "角色海报");
  assert.equal(PROMPT_APPS[0].cover.tone, "rose");
});

test("character poster app is public and relies on image job API access rules", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "character-poster");

  assert.equal(app.access, "public-image-job-api");
});

test("buildCharacterPosterPrompt inserts character and note", () => {
  const { buildCharacterPosterPrompt } = loadPromptApps();
  const prompt = buildCharacterPosterPrompt({ character: "张夏", note: "网络小说青山的女主" });

  assert.match(prompt, /【角色】= \{张夏\}（网络小说青山的女主）/);
  assert.match(prompt, /16:9横版/);
  assert.match(prompt, /中文文字/);
  assert.match(prompt, /4K超高清/);
});

test("buildCharacterPosterPrompt trims input and omits empty note wrapper", () => {
  const { buildCharacterPosterPrompt } = loadPromptApps();
  const prompt = buildCharacterPosterPrompt({ character: "  张夏  ", note: "   " });

  assert.match(prompt, /【角色】= \{张夏\}/);
  assert.doesNotMatch(prompt.split("\n")[0], /（）/);
});
