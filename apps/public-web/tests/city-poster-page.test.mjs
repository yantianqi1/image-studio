import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appFile = new URL("../src/features/prompt-apps/city-poster-app.tsx", import.meta.url);
const pageFile = new URL("../src/app/apps/city-poster/page.tsx", import.meta.url);
const promptFile = new URL("../src/features/prompt-apps/city-poster-prompt.ts", import.meta.url);
const sharedAppFile = new URL("../src/features/prompt-apps/prompt-image-generate-app.tsx", import.meta.url);

function readRequiredSource(file, label) {
  assert.equal(existsSync(file), true, `${label} should exist`);
  return readFileSync(file, "utf8");
}

test("city poster route renders the app component", () => {
  const pageSource = readRequiredSource(pageFile, "city poster page route");

  assert.match(pageSource, /import \{ CityPosterApp \}/);
  assert.match(pageSource, /return <CityPosterApp \/>/);
});

test("city poster page exposes city form and app center back link", () => {
  const appSource = readRequiredSource(appFile, "city poster app");
  const sharedAppSource = readRequiredSource(sharedAppFile, "shared prompt image generate app");

  assert.match(appSource, /headerTitle="城市宣传海报"/);
  assert.match(sharedAppSource, /aria-label="返回应用中心"/);
  assert.match(sharedAppSource, /href="\/apps"/);
  assert.match(appSource, /primaryPlaceholder="例如：杭州"/);
  assert.match(appSource, /输入城市和备注，生成新春国潮城市宣传海报。/);
});

test("city poster page keeps the full prompt template hidden", () => {
  const appSource = readRequiredSource(appFile, "city poster app");
  const promptSource = readRequiredSource(promptFile, "city poster prompt builder");

  assert.doesNotMatch(appSource, /长长的红色丝绸舞带/);
  assert.doesNotMatch(appSource, /壮丽的山脉河流/);
  assert.doesNotMatch(appSource, /经济中心，魅力魔都/);
  assert.match(promptSource, /长长的红色丝绸舞带/);
  assert.match(promptSource, /壮丽的山脉河流/);
});
