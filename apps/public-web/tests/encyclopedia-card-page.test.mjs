import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/features/prompt-apps/encyclopedia-card-app.tsx", import.meta.url),
  "utf8",
);

const pageSource = readFileSync(
  new URL("../src/app/apps/encyclopedia-card/page.tsx", import.meta.url),
  "utf8",
);

test("encyclopedia card route renders the app component", () => {
  assert.match(pageSource, /import \{ EncyclopediaCardApp \}/);
  assert.match(pageSource, /return <EncyclopediaCardApp \/>/);
});

test("encyclopedia card page exposes topic form and app center back link", () => {
  assert.match(appSource, /headerTitle="科普百科图"/);
  assert.match(appSource, /aria-label="返回应用中心"/);
  assert.match(appSource, /href="\/apps"/);
  assert.match(appSource, /placeholder="例如：狸花猫"/);
  assert.match(appSource, /输入主题词，生成竖版模块化科普信息图。/);
});

test("encyclopedia card page keeps the full prompt template hidden", () => {
  assert.doesNotMatch(appSource, /图鉴感、百科感、信息结构感、收藏感/);
  assert.doesNotMatch(appSource, /请不要做成普通商业宣传海报/);
});
