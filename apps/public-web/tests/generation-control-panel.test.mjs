import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/home/generation-control-panel.tsx", import.meta.url),
  "utf8",
);

const uploadSource = readFileSync(
  new URL("../src/features/home/generation-prompt-image-upload.tsx", import.meta.url),
  "utf8",
);

const visibilitySource = readFileSync(
  new URL("../src/features/home/generation-visibility-field.tsx", import.meta.url),
  "utf8",
);

const workbenchSource = readFileSync(
  new URL("../src/features/home/generation-workbench.tsx", import.meta.url),
  "utf8",
);

test("generation prompt input does not cap prompt length in the browser", () => {
  assert.doesNotMatch(source, /maxLength=/);
  assert.doesNotMatch(source, /PROMPT_MAX_LENGTH/);
  assert.doesNotMatch(source, /form\.prompt\.length\s*\/\s*PROMPT_MAX_LENGTH/);
});

test("generation reference upload supports multiple images in one job", () => {
  assert.match(uploadSource, /multiple/);
  assert.match(workbenchSource, /referenceImages/);
  assert.match(workbenchSource, /reference_asset_ids/);
});

test("generation form lets users choose private or public visibility", () => {
  assert.match(source, /GenerationVisibilityField/);
  assert.match(visibilitySource, /私有保存/);
  assert.match(visibilitySource, /公开展示/);
  assert.match(workbenchSource, /visibility: form\.visibility/);
});
