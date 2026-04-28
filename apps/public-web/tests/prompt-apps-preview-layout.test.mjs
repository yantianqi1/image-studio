import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resultPanelSource = readFileSync(
  new URL("../src/features/prompt-apps/character-poster-result-panel.tsx", import.meta.url),
  "utf8",
);

const stylesSource = readFileSync(
  new URL("../src/features/prompt-apps/prompt-apps.module.css", import.meta.url),
  "utf8",
);

test("prompt app result preview reserves a dedicated image viewport", () => {
  assert.match(resultPanelSource, /resultStagePreview/);
  assert.match(resultPanelSource, /posterImageGridSingle/);
  assert.match(stylesSource, /\.resultStage\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(stylesSource, /\.resultStagePreview\s*\{[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\);/);
  assert.match(stylesSource, /\.resultStagePreview\s*\{[\s\S]*overflow:\s*hidden;/);
});

test("prompt app single-image preview fits inside the viewport", () => {
  const imageBlock = stylesSource.match(/\.posterImageButton img\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const singleImageBlock = stylesSource.match(/\.posterImageGridSingle \.posterImageButton img\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.doesNotMatch(imageBlock, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.doesNotMatch(imageBlock, /object-fit:\s*cover/);
  assert.match(imageBlock, /height:\s*auto;/);
  assert.match(imageBlock, /object-fit:\s*contain;/);
  assert.match(stylesSource, /\.posterImageGridSingle \.posterImageButton\s*\{[\s\S]*position:\s*relative;/);
  assert.match(singleImageBlock, /position:\s*absolute;/);
  assert.match(singleImageBlock, /inset:\s*0;/);
  assert.match(singleImageBlock, /width:\s*100%;/);
  assert.match(singleImageBlock, /height:\s*100%;/);
});
