import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("generated image results open a shared click-to-preview dialog", () => {
  const source = readSource("../src/features/home/generation-result-panel.tsx");

  assert.match(source, /ImagePreviewDialog/);
  assert.match(source, /imagePreviewButton/);
  assert.match(source, /onPreview\(\{ src: image\.url, alt: title \}\)/);
});

test("character poster results use click-to-preview instead of static images", () => {
  const source = readSource("../src/features/prompt-apps/character-poster-result-panel.tsx");

  assert.match(source, /ImagePreviewDialog/);
  assert.match(source, /posterImageButton/);
  assert.match(source, /onPreview\(\{ src: image\.url, alt:/);
});

test("comic featured image opens the same preview dialog by clicking the image", () => {
  const source = readSource("../src/features/comic/manga-preview-panel.tsx");

  assert.match(source, /ImagePreviewDialog/);
  assert.match(source, /featuredPreviewButton/);
  assert.match(source, /toPreviewImage/);
});
