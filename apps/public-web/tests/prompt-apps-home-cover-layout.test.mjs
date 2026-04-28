import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync(
  new URL("../src/features/prompt-apps/prompt-apps-home.tsx", import.meta.url),
  "utf8",
);

const stylesSource = readFileSync(
  new URL("../src/features/prompt-apps/prompt-apps-home.module.css", import.meta.url),
  "utf8",
);

test("prompt app home applies portrait cover class from catalog data", () => {
  assert.match(homeSource, /cover\.aspectRatio === "3:4"/);
  assert.match(homeSource, /styles\.appCoverPortrait/);
});

test("portrait prompt app covers keep the shared card frame", () => {
  const portraitBlock = stylesSource.match(/\.appCoverPortrait\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(stylesSource, /\.appCover\s*\{[\s\S]*aspect-ratio:\s*16\s*\/\s*10;/);
  assert.doesNotMatch(portraitBlock, /aspect-ratio:/);
});

test("portrait prompt app covers contain the 3:4 image with side breathing room", () => {
  const portraitImageBlock = stylesSource.match(/\.appCoverPortrait \.appCoverImage\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(portraitImageBlock, /object-fit:\s*contain;/);
  assert.match(portraitImageBlock, /object-position:\s*center center;/);
  assert.match(portraitImageBlock, /transform:\s*scale\(0\.94\);/);
});
