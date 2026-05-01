import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/home/generation-result-panel.tsx", import.meta.url),
  "utf8",
);

const actionsSource = readFileSync(
  new URL("../src/features/home/generation-result-actions.tsx", import.meta.url),
  "utf8",
);

test("generation result cards can publish or privatize rendered assets", () => {
  assert.match(source, /ResultActionBar/);
  assert.match(actionsSource, /updateImageAssetVisibility/);
  assert.match(actionsSource, /公开到图库/);
  assert.match(actionsSource, /取消公开/);
});
