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

const workbenchSource = readFileSync(
  new URL("../src/features/home/generation-workbench.tsx", import.meta.url),
  "utf8",
);

const reusePromptSource = readFileSync(
  new URL("../src/features/home/generation-reuse-prompt.ts", import.meta.url),
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

test("generation form saves privately and exposes visibility after results", () => {
  assert.doesNotMatch(source, /GenerationVisibilityField/);
  assert.doesNotMatch(source, /私有保存/);
  assert.doesNotMatch(source, /公开展示/);
  assert.doesNotMatch(workbenchSource, /visibility: form\.visibility/);
  assert.match(workbenchSource, /visibility: "private"/);
});

test("generation workbench can prefill prompt from gallery reuse URL", () => {
  assert.match(reusePromptSource, /readReusePromptFromLocation/);
  assert.match(reusePromptSource, /URLSearchParams/);
  assert.match(reusePromptSource, /setPendingReusePrompt/);
  assert.match(reusePromptSource, /prompt: pendingReusePrompt/);
});
