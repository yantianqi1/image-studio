import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/prompt-apps/character-poster-app.tsx", import.meta.url),
  "utf8",
);

test("character poster app exposes a back link to the app center", () => {
  assert.match(source, /leadingAction=\{<PromptAppBackLink \/>}/);
  assert.match(source, /href="\/apps"/);
  assert.match(source, /aria-label="返回应用中心"/);
});
