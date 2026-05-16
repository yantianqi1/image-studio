import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsPageSource = readFileSync(
  new URL("../src/features/settings/settings-page.tsx", import.meta.url),
  "utf8",
);
const purposeFieldsSource = readFileSync(
  new URL("../src/features/settings/settings-llm-purpose-models.tsx", import.meta.url),
  "utf8",
);
const adminApiSource = readFileSync(new URL("../src/lib/admin-api.ts", import.meta.url), "utf8");

test("settings page exposes per-purpose LLM model selectors", () => {
  assert.match(settingsPageSource, /useModels/);
  assert.match(settingsPageSource, /LlmPurposeModelFields/);
  assert.match(settingsPageSource, /llm_purpose_model_codes/);
  assert.match(settingsPageSource, /llm_purpose_model:/);
  assert.match(purposeFieldsSource, /model\.capability === "chat"/);
  assert.match(purposeFieldsSource, /model\.capability === "text"/);
  assert.match(purposeFieldsSource, /默认模型/);
});

test("admin settings API carries LLM purpose model codes", () => {
  assert.match(adminApiSource, /llm_purpose_model_codes: Record<string, string>/);
  assert.match(adminApiSource, /llm_purpose_models/);
});
