import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadGalleryEvents() {
  const source = readFileSync(
    new URL("../src/features/gallery/gallery-events.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { CustomEvent, Event, exports: {}, module: { exports: {} }, window: undefined };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("mergeImageGalleryItems prepends new matching items without duplicates", () => {
  const { mergeImageGalleryItems } = loadGalleryEvents();
  const current = [
    galleryItem({ asset_id: 1, visibility: "public" }),
    galleryItem({ asset_id: 2, visibility: "private" }),
  ];
  const incoming = [
    galleryItem({ asset_id: 3, visibility: "public" }),
    galleryItem({ asset_id: 1, visibility: "public" }),
    galleryItem({ asset_id: 4, visibility: "private" }),
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(mergeImageGalleryItems(current, incoming, "public").map((item) => item.asset_id))),
    [3, 1],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(mergeImageGalleryItems(current, incoming, "mine").map((item) => item.asset_id))),
    [3, 1, 4, 2],
  );
});

test("imageJobResultsToGalleryItems preserves image metadata for gallery insertion", () => {
  const { imageJobResultsToGalleryItems } = loadGalleryEvents();
  const items = imageJobResultsToGalleryItems([
    {
      id: 8,
      job_id: 12,
      result_index: 2,
      asset_id: 44,
      asset_url: "/asset/44",
      thumbnail_url: "/asset/44/thumb",
      visibility: "public",
      published_at: "2026-05-21T00:00:00Z",
      created_at: "2026-05-21T00:00:01Z",
      revised_prompt: "revised",
      provider_request_id: "req",
    },
  ], {
    prompt: "prompt",
    visibility: "private",
  });

  assert.deepEqual(JSON.parse(JSON.stringify(items)), [{
    asset_id: 44,
    asset_url: "/asset/44",
    thumbnail_url: "/asset/44/thumb",
    visibility: "public",
    published_at: "2026-05-21T00:00:00Z",
    created_at: "2026-05-21T00:00:01Z",
    job_id: 12,
    result_index: 2,
    prompt: "prompt",
    revised_prompt: "revised",
  }]);
});

function galleryItem(patch) {
  return {
    asset_id: patch.asset_id,
    asset_url: `/asset/${patch.asset_id}`,
    thumbnail_url: `/asset/${patch.asset_id}/thumb`,
    visibility: patch.visibility,
    published_at: null,
    created_at: "2026-05-21T00:00:00Z",
    job_id: 10,
    result_index: patch.asset_id,
    prompt: "prompt",
    revised_prompt: null,
  };
}
