import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/app/gallery/page.tsx", import.meta.url),
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

test("gallery page loads mine and public image scopes", () => {
  assert.match(gallerySource, /activeHref="\/gallery"/);
  assert.match(gallerySource, /publicApi\.getImageGallery/);
  assert.match(gallerySource, /scope === "mine"/);
  assert.match(gallerySource, /scope === "public"/);
});

test("gallery page uses a responsive masonry layout", () => {
  assert.match(masonrySource, /useOrderedGalleryColumns/);
  assert.match(stylesSource, /galleryGrid/);
  assert.match(stylesSource, /column/);
});
