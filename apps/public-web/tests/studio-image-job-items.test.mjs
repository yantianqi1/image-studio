import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadImageJobItems() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-image-job-items.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("studio image job helper attaches result item metadata by result index", () => {
  const { imageJobResultsToStoredImagesWithItems } = loadImageJobItems();

  const images = imageJobResultsToStoredImagesWithItems(
    [
      { id: 10, job_id: 5, result_index: 2, asset_id: 20, asset_url: "/asset/20", revised_prompt: null },
      { id: 11, job_id: 5, result_index: 1, asset_id: 21, asset_url: "/asset/21", revised_prompt: null },
    ],
    [
      { id: 7, job_id: 5, result_index: 1, status: "succeeded", asset_id: 21, manual_retry_count: 0 },
      { id: 8, job_id: 5, result_index: 2, status: "failed", asset_id: null, error_message: "blocked", manual_retry_count: 1 },
    ],
  );

  assert.deepEqual(images.map((image) => image.resultIndex), [2, 1]);
  assert.equal(images[0].jobItemId, 8);
  assert.equal(images[0].jobItemStatus, "failed");
  assert.equal(images[0].jobItemError, "blocked");
  assert.equal(images[1].jobItemId, 7);
});

test("studio image job helper derives per-slot status summaries and actions", () => {
  const {
    getImageJobItemSummary,
    getImageResultSlots,
    isCancellableImageJobItem,
    isRetryableImageJobItem,
  } = loadImageJobItems();
  const items = [
    { id: 1, resultIndex: 1, status: "succeeded", manualRetryCount: 0 },
    { id: 2, resultIndex: 2, status: "running", manualRetryCount: 0 },
    { id: 3, resultIndex: 3, status: "queued", manualRetryCount: 1 },
    { id: 4, resultIndex: 4, status: "failed", manualRetryCount: 0 },
  ];

  const slots = getImageResultSlots({
    count: 4,
    images: [{ id: "asset-10", resultIndex: 1, url: "/asset/10" }],
    imageJobItems: items,
  });
  const summary = getImageJobItemSummary(items, 4);

  assert.deepEqual([...slots.map((slot) => slot.resultIndex)], [1, 2, 3, 4]);
  assert.equal(slots[0].image?.id, "asset-10");
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), [
    { label: "1/4 succeeded", status: "succeeded" },
    { label: "1/4 running", status: "running" },
    { label: "1/4 retrying", status: "retrying" },
    { label: "1/4 failed", status: "failed" },
  ]);
  assert.equal(isCancellableImageJobItem(items[1]), true);
  assert.equal(isRetryableImageJobItem(items[3]), true);
});
