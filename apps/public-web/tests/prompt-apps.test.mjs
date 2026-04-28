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

  assert.deepEqual(Array.from(PROMPT_APPS, (app) => app.id), ["character-poster", "encyclopedia-card"]);
  assert.equal(PROMPT_APPS[0].title, "角色海报");
  assert.equal(PROMPT_APPS[0].href, "/apps/character-poster");
  assert.equal(PROMPT_APPS[0].cover.label, "角色海报");
  assert.equal(PROMPT_APPS[0].cover.imageSrc, "/app-covers/character-poster-hutao.png");
});

test("prompt app catalog exposes encyclopedia card app", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "encyclopedia-card");

  assert.equal(app.title, "科普百科图");
  assert.equal(app.href, "/apps/encyclopedia-card");
  assert.equal(app.cover.label, "科普百科图");
  assert.equal(app.cover.imageSrc, "/app-covers/encyclopedia-card-hajimi.png");
  assert.equal(app.cover.aspectRatio, "3:4");
  assert.equal(app.statusLabel, "内置提示词");
});

test("encyclopedia card app cover asset is a 3:4 PNG", () => {
  const dimensions = readPngDimensions("apps/public-web/public/app-covers/encyclopedia-card-hajimi.png");

  assert.equal(dimensions.width * 4, dimensions.height * 3);
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

test("buildEncyclopediaCardPrompt inserts topic and note", () => {
  const { buildEncyclopediaCardPrompt } = loadPromptApps();
  const prompt = buildEncyclopediaCardPrompt({ topic: "狸花猫", note: "适合新手养猫家庭" });

  assert.match(prompt, /【主题】= \{狸花猫\}（适合新手养猫家庭）/);
  assert.match(prompt, /高质量竖版「科普百科图」/);
  assert.match(prompt, /图鉴感、百科感、信息结构感、收藏感/);
  assert.match(prompt, /Top 5模块/);
});

test("buildEncyclopediaCardPrompt trims input and omits empty note wrapper", () => {
  const { buildEncyclopediaCardPrompt } = loadPromptApps();
  const prompt = buildEncyclopediaCardPrompt({ topic: "  狸花猫  ", note: "   " });

  assert.match(prompt, /【主题】= \{狸花猫\}/);
  assert.doesNotMatch(prompt.split("\n")[0], /（）/);
});

function readPngDimensions(path) {
  const header = readFileSync(path).subarray(0, 24);
  assert.equal(header.toString("ascii", 1, 4), "PNG");
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}
