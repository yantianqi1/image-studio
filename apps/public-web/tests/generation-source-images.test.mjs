import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const promptUploadSource = readFileSync(
  new URL("../src/features/home/generation-prompt-image-upload.tsx", import.meta.url),
  "utf8",
);

const resultActionsSource = readFileSync(
  new URL("../src/features/home/generation-result-actions.tsx", import.meta.url),
  "utf8",
);

const uploadReferenceSource = readFileSync(
  new URL("../src/features/home/generation-upload-reference-images.ts", import.meta.url),
  "utf8",
);

function loadSourceImages() {
  const source = readFileSync(
    new URL("../src/features/home/generation-source-images.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("reference image previews use thumbnails instead of full asset urls", () => {
  const { getGenerationSourceImagePreviewUrl } = loadSourceImages();

  assert.equal(
    getGenerationSourceImagePreviewUrl({
      assetId: 42,
      assetUrl: "/api/public/image/assets/42",
    }),
    "/api/public/image/assets/42/thumbnail",
  );
  assert.equal(
    getGenerationSourceImagePreviewUrl({
      assetId: 43,
      assetUrl: "/api/public/image/assets/43",
      thumbnailUrl: "/api/public/image/assets/43/thumbnail",
    }),
    "/api/public/image/assets/43/thumbnail",
  );
});

test("history result images keep full urls for editing while exposing thumbnails for preview", () => {
  const { historyImageToSourceImage } = loadSourceImages();

  const sourceImage = historyImageToSourceImage({
    id: "result-7",
    assetId: 7,
    url: "/api/public/image/assets/7",
    thumbnailUrl: "/api/public/image/assets/7/thumbnail",
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(sourceImage)),
    {
      assetId: 7,
      assetUrl: "/api/public/image/assets/7",
      thumbnailUrl: "/api/public/image/assets/7/thumbnail",
    },
  );
});

test("reference image rendering and creation use thumbnail-aware source images", () => {
  assert.match(promptUploadSource, /getGenerationSourceImagePreviewUrl/);
  assert.doesNotMatch(promptUploadSource, /src=\{image\.assetUrl\}/);
  assert.match(resultActionsSource, /historyImageToSourceImage/);
  assert.match(uploadReferenceSource, /getImageAssetThumbnailUrl/);
});
