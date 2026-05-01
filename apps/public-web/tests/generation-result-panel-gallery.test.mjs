import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/home/generation-result-panel.tsx", import.meta.url),
  "utf8",
);

const actionsSource = readFileSync(
  new URL("../src/features/home/generation-result-actions.tsx", import.meta.url),
  "utf8",
);

test("generation result cards can publish or privatize rendered assets", () => {
  assert.match(source, /ResultActionBar/);
  assert.match(actionsSource, /updateImageAssetVisibility/);
  assert.match(actionsSource, /公开到图库/);
  assert.match(actionsSource, /取消公开/);
});

test("generation result grid uses thumbnails without changing preview original url", () => {
  assert.match(source, /getPreviewImageUrl/);
  assert.match(source, /thumbnailUrl/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /decoding="async"/);
  assert.match(source, /onClick=\{\(\) => onPreview\(\{ src: image\.url, alt: title \}\)\}/);
});

test("generation progress uses observable image job states", () => {
  assert.match(source, /提交成功/);
  assert.match(source, /队列等待/);
  assert.match(source, /Worker 生成/);
  assert.match(source, /已完成/);
  assert.doesNotMatch(source, /结果写回/);
  assert.doesNotMatch(source, /完成展示/);
});
