import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/home/generation-control-panel.tsx", import.meta.url),
  "utf8",
);

test("generation prompt input does not cap prompt length in the browser", () => {
  assert.doesNotMatch(source, /maxLength=/);
  assert.doesNotMatch(source, /PROMPT_MAX_LENGTH/);
  assert.doesNotMatch(source, /form\.prompt\.length\s*\/\s*PROMPT_MAX_LENGTH/);
});
