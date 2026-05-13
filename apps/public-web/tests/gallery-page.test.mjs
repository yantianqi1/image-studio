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

const publicApiTypesSource = readFileSync(
  new URL("../src/lib/public-api.types.ts", import.meta.url),
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
  assert.match(generatePageSource, /StudioPage/);
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

test("gallery keeps phone and tablet masonry dense", () => {
  assert.match(masonrySource, /const MIN_GALLERY_COLUMN_COUNT = 2/);
  assert.match(masonrySource, /{ minWidth: 1180, columns: 4 }/);
  assert.match(masonrySource, /{ minWidth: 820, columns: 4 }/);
  assert.match(masonrySource, /{ minWidth: 540, columns: 3 }/);
  assert.match(stylesSource, /@media \(max-width: 1179px\)/);
  assert.match(stylesSource, /@media \(max-width: 819px\)/);
  assert.match(stylesSource, /@media \(max-width: 539px\)/);
  assert.match(
    masonrySource,
    /sizes="\(min-width: 1180px\) 25vw, \(min-width: 820px\) 25vw, \(min-width: 540px\) 33vw, 50vw"/,
  );
  assert.match(stylesSource, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(stylesSource, /grid-template-columns: 1fr/);
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

test("gallery stream loads thumbnails and keeps original assets for preview and download", () => {
  assert.match(publicApiTypesSource, /thumbnail_url: string/);
  assert.match(masonrySource, /src={item\.thumbnail_url}/);
  assert.match(masonrySource, /onPreview\(\{ src: item\.asset_url/);
  assert.match(masonrySource, /href={item\.asset_url}/);
});

test("gallery batches image measurements to avoid per-image masonry reflows", () => {
  assert.match(masonrySource, /pendingAspectRatiosRef/);
  assert.match(masonrySource, /scheduledAspectRatioFrameRef/);
  assert.match(masonrySource, /requestAnimationFrame/);
  assert.match(masonrySource, /cancelAnimationFrame/);
  assert.match(masonrySource, /flushPendingAspectRatios/);
  assert.doesNotMatch(masonrySource, /onImageMeasure=\{updateImageAspectRatio\}/);
});

test("gallery cards expose offscreen rendering hints without changing layout", () => {
  assert.match(stylesSource, /\.tile\s*{[^}]*content-visibility: auto/s);
  assert.match(stylesSource, /\.tile\s*{[^}]*contain-intrinsic-size:/s);
});
