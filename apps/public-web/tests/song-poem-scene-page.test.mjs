import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appFile = new URL("../src/features/prompt-apps/song-poem-scene-app.tsx", import.meta.url);
const pageFile = new URL("../src/app/apps/song-poem-scene/page.tsx", import.meta.url);
const promptFile = new URL("../src/features/prompt-apps/song-poem-scene-prompt.ts", import.meta.url);
const sharedAppFile = new URL("../src/features/prompt-apps/prompt-image-generate-app.tsx", import.meta.url);

function readRequiredSource(file, label) {
  assert.equal(existsSync(file), true, `${label} should exist`);
  return readFileSync(file, "utf8");
}

test("song poem scene route renders the app component", () => {
  const pageSource = readRequiredSource(pageFile, "song poem scene page route");

  assert.match(pageSource, /import \{ SongPoemSceneApp \}/);
  assert.match(pageSource, /return <SongPoemSceneApp \/>/);
});

test("song poem scene page exposes poem form and app center back link", () => {
  const appSource = readRequiredSource(appFile, "song poem scene app");
  const sharedAppSource = readRequiredSource(sharedAppFile, "shared prompt image generate app");

  assert.match(appSource, /headerTitle="宋词双境图"/);
  assert.match(sharedAppSource, /aria-label="返回应用中心"/);
  assert.match(sharedAppSource, /href="\/apps"/);
  assert.match(appSource, /primaryLabel="对应小诗"/);
  assert.match(appSource, /primaryName="poem"/);
  assert.match(appSource, /primaryPlaceholder="例如：花褪残红青杏小"/);
  assert.match(appSource, /输入对应小诗，生成墙内墙外对照的宋代诗意场景。/);
});

test("song poem scene page keeps the full prompt template hidden", () => {
  const appSource = readRequiredSource(appFile, "song poem scene app");
  const promptSource = readRequiredSource(promptFile, "song poem scene prompt builder");

  assert.doesNotMatch(appSource, /一堵高大的青砖墙作为画面中央分割线/);
  assert.doesNotMatch(appSource, /墙外是一条春日小路/);
  assert.doesNotMatch(appSource, /墙内是一座春日庭院/);
  assert.match(promptSource, /一堵高大的青砖墙作为画面中央分割线/);
  assert.match(promptSource, /墙外是一条春日小路/);
  assert.match(promptSource, /墙内是一座春日庭院/);
});
