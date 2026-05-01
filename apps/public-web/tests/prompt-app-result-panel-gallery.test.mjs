import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const genericPanelSource = readFileSync(
  new URL("../src/features/prompt-apps/prompt-app-result-panel.tsx", import.meta.url),
  "utf8",
);

const posterPanelSource = readFileSync(
  new URL("../src/features/prompt-apps/character-poster-result-panel.tsx", import.meta.url),
  "utf8",
);

const actionsSource = readFileSync(
  new URL("../src/features/home/generation-result-actions.tsx", import.meta.url),
  "utf8",
);

test("prompt app result panels can publish generated images to gallery", () => {
  assert.match(genericPanelSource, /ResultActionBar/);
  assert.match(posterPanelSource, /ResultActionBar/);
  assert.match(actionsSource, /updateImageAssetVisibility/);
  assert.match(actionsSource, /公开到图库/);
});

test("source image action is hidden when prompt apps do not provide a reuse handler", () => {
  const sourceImageActionSource = actionsSource.match(
    /function SourceImageAction[\s\S]*?function getNextVisibility/,
  )?.[0] ?? "";

  assert.match(sourceImageActionSource, /!onUseAsSourceImage/);
});
