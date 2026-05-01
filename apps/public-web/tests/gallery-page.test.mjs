import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const galleryActionsStylesUrl = new URL(
  "../src/features/gallery/gallery-actions.module.css",
  import.meta.url,
);

const galleryActionsStylesSource = existsSync(galleryActionsStylesUrl)
  ? readFileSync(galleryActionsStylesUrl, "utf8")
  : "";

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

test("gallery header keeps title and controls compact on desktop", () => {
  assert.match(stylesSource, /\.header\s*{[^}]*display: flex/s);
  assert.match(stylesSource, /\.masthead\s*{[^}]*display: flex/s);
  assert.match(stylesSource, /font-size: clamp\(1\.55rem, 2\.4vw, 2\.15rem\)/);
  assert.doesNotMatch(stylesSource, /font-size: clamp\(2\.45rem, 5vw, 4\.4rem\)/);
});

test("gallery cards expose hover actions for prompt reuse and download", () => {
  assert.match(masonrySource, /复制/);
  assert.match(masonrySource, /复用/);
  assert.match(masonrySource, /下载/);
  assert.match(masonrySource, /navigator\.clipboard\.writeText/);
  assert.match(masonrySource, /\/generate\?prompt=/);
  assert.match(masonrySource, /download=/);
  assert.match(galleryActionsStylesSource, /actionBar/);
  assert.match(galleryActionsStylesSource, /actionTile:hover/);
});
