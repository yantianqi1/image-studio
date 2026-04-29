import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/features/prompt-apps/silhouette-universe-poster-app.tsx", import.meta.url),
  "utf8",
);

const pageSource = readFileSync(
  new URL("../src/app/apps/silhouette-universe-poster/page.tsx", import.meta.url),
  "utf8",
);

test("silhouette universe poster route renders the app component", () => {
  assert.match(pageSource, /import \{ SilhouetteUniversePosterApp \}/);
  assert.match(pageSource, /return <SilhouetteUniversePosterApp \/>/);
});

test("silhouette universe poster page exposes topic form and app center back link", () => {
  assert.match(appSource, /headerTitle="轮廓宇宙海报"/);
  assert.match(appSource, /aria-label="返回应用中心"/);
  assert.match(appSource, /href="\/apps"/);
  assert.match(appSource, /placeholder="例如：海底图书馆"/);
  assert.match(appSource, /输入主题，生成收藏版叙事海报。/);
});

test("silhouette universe poster page keeps the full prompt template hidden", () => {
  assert.doesNotMatch(appSource, /不要优先默认瓶子、沙漏、玻璃罩/);
  assert.doesNotMatch(appSource, /完整的主题世界自然生长在这个主轮廓/);
  assert.doesNotMatch(appSource, /梦幻水彩质感与纸张印刷品气质/);
});
