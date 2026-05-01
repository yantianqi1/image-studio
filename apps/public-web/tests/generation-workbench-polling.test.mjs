import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/home/generation-workbench.tsx", import.meta.url),
  "utf8",
);

test("generation workbench polling effect uses stable dependencies and aborts stale polls", () => {
  assert.match(source, /const activeHistoryId = activeHistory\?\.id \?\? null;/);
  assert.match(source, /const activeTaskId = activeHistory\?\.taskId \?\? null;/);
  assert.match(source, /const shouldPollActiveHistory = shouldResumeImageJobHistory\(activeHistory\);/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal: abortController\.signal/);
  assert.doesNotMatch(source, /\}, \[activeHistory, completeHistory, failHistory\]\);/);
});
