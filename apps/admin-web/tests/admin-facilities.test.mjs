import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const facilitiesSource = readFileSync(
  new URL("../src/features/facilities/llm-facilities-page.tsx", import.meta.url),
  "utf8",
);
const navSource = readFileSync(new URL("../src/features/shell/admin-nav.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src/lib/admin-api.ts", import.meta.url), "utf8");

test("admin facilities page wires the llm feature model mapping panel", () => {
  assert.match(facilitiesSource, /LLM 设施面板/);
  assert.match(facilitiesSource, /updateLlmFacilities/);
  assert.match(facilitiesSource, /required_capabilities/);
  assert.match(navSource, /\/admin\/facilities/);
  assert.match(apiSource, /llmFacilities\(\)/);
  assert.match(apiSource, /updateLlmFacilities/);
});
