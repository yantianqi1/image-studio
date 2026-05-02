import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const pageFile = new URL("../src/app/apps/prompt-crafter/page.tsx", import.meta.url);
const appFile = new URL("../src/features/prompt-crafter/prompt-crafter-app.tsx", import.meta.url);
const apiFile = new URL("../src/features/prompt-crafter/prompt-crafter-api.ts", import.meta.url);
const stylesFile = new URL("../src/features/prompt-crafter/prompt-crafter.module.css", import.meta.url);

function readRequiredSource(file, label) {
  assert.equal(existsSync(file), true, `${label} should exist`);
  return readFileSync(file, "utf8");
}

test("prompt crafter route renders the app component", () => {
  const pageSource = readRequiredSource(pageFile, "prompt crafter route");

  assert.match(pageSource, /import \{ PromptCrafterApp \}/);
  assert.match(pageSource, /return <PromptCrafterApp \/>/);
});

test("prompt crafter page exposes a streaming workspace", () => {
  const appSource = readRequiredSource(appFile, "prompt crafter app");
  const apiSource = readRequiredSource(apiFile, "prompt crafter api");
  const stylesSource = readRequiredSource(stylesFile, "prompt crafter styles");

  assert.match(appSource, /headerTitle="提示词工坊"/);
  assert.match(appSource, /aria-label="返回应用中心"/);
  assert.match(appSource, /生成提示词/);
  assert.match(appSource, /继续优化/);
  assert.match(appSource, /发送到生图/);
  assert.match(appSource, /streamPromptCrafter/);
  assert.match(apiSource, /\/prompt-crafter\/chat\/stream/);
  assert.match(stylesSource, /\.workspace\s*\{[\s\S]*grid-template-columns:/);
  assert.match(stylesSource, /\.resultText\s*\{[\s\S]*white-space:\s*pre-wrap;/);
});

test("prompt crafter page keeps skill internals out of the UI source", () => {
  const appSource = readRequiredSource(appFile, "prompt crafter app");

  assert.doesNotMatch(appSource, /Human-Subject Photography/);
  assert.doesNotMatch(appSource, /Face detail recipes/);
  assert.doesNotMatch(appSource, /Default Output/);
});
