import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resultsSource = readFileSync(
  new URL("../src/features/studio/studio-results.tsx", import.meta.url),
  "utf8",
);

test("studio downloads generated source files through the owned asset download endpoint", () => {
  assert.match(resultsSource, /buildAssetDownloadUrl\(image\.assetId\)/);
  assert.match(resultsSource, /\/api\/public\/image\/assets\/\$\{assetId\}\/download/);
  assert.match(resultsSource, /download=\{downloadFileName\(turn\.prompt, image\.assetId\)\}/);
  assert.doesNotMatch(resultsSource, /fetch\(url\)/);
  assert.doesNotMatch(resultsSource, /window\.open\(url/);
});
