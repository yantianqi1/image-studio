import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/app/gallery/page.tsx", import.meta.url),
  "utf8",
);

const homePageSource = readFileSync(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8",
);

const generatePageSource = readFileSync(
  new URL("../src/app/generate/page.tsx", import.meta.url),
  "utf8",
);

const gallerySource = readFileSync(
  new URL("../src/features/gallery/gallery-page.tsx", import.meta.url),
  "utf8",
);

const masonrySource = readFileSync(
  new URL("../src/features/gallery/gallery-masonry.tsx", import.meta.url),
  "utf8",
);

const stylesSource = readFileSync(
  new URL("../src/features/gallery/gallery-page.module.css", import.meta.url),
  "utf8",
);

test("gallery route renders the image gallery page", () => {
  assert.match(pageSource, /GalleryPage/);
});

test("site home opens the public image stream", () => {
  assert.match(homePageSource, /GalleryPage/);
  assert.match(homePageSource, /initialScope="public"/);
  assert.match(homePageSource, /activeHref="\/"/);
  assert.match(generatePageSource, /GenerationWorkbench/);
});

test("gallery page loads mine and public image scopes", () => {
  assert.match(gallerySource, /initialScope = "mine"/);
  assert.match(gallerySource, /publicApi\.getImageGallery/);
  assert.match(gallerySource, /scope === "mine"/);
  assert.match(gallerySource, /scope === "public"/);
});

test("gallery page uses a responsive masonry layout", () => {
  assert.match(masonrySource, /useMeasuredGalleryColumns/);
  assert.match(masonrySource, /GALLERY_MASONRY_BREAKPOINTS/);
  assert.match(masonrySource, /matchMedia/);
  assert.match(masonrySource, /naturalWidth/);
  assert.match(masonrySource, /columnHeights/);
  assert.match(stylesSource, /galleryGrid/);
  assert.match(stylesSource, /column/);
});

test("gallery homepage has polished image-first product treatment", () => {
  assert.match(gallerySource, /图片库/);
  assert.match(gallerySource, /公开图库/);
  assert.doesNotMatch(gallerySource, />Gallery<\/p>/);
  assert.doesNotMatch(gallerySource, /公开图片流/);
  assert.doesNotMatch(gallerySource, /来自 Image Studio/);
  assert.match(stylesSource, /masthead/);
  assert.match(stylesSource, /galleryToolbar/);
  assert.doesNotMatch(stylesSource, /heroPanel/);
  assert.match(masonrySource, /tileOverlay/);
});
