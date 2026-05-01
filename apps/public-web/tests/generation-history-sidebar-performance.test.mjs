import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebarSource = readFileSync(
  new URL("../src/features/home/generation-history-sidebar.tsx", import.meta.url),
  "utf8",
);

const itemSource = readFileSync(
  new URL("../src/features/home/generation-history-item.tsx", import.meta.url),
  "utf8",
);

const historyHookSource = readFileSync(
  new URL("../src/features/home/use-generation-history.ts", import.meta.url),
  "utf8",
);

test("generation history sidebar keeps item props stable during active selection changes", () => {
  assert.match(itemSource, /memo\(/);
  assert.match(itemSource, /areHistoryItemPropsEqual/);
  assert.match(sidebarSource, /const handleSelectHistory = useCallback/);
  assert.match(sidebarSource, /onSelectHistory=\{handleSelectHistory\}/);
  assert.doesNotMatch(sidebarSource, /onSelect=\{\(\) => onSelectHistory\(item\.id\)\}/);
});

test("generation history item avoids full prompt work in list rendering", () => {
  assert.match(itemSource, /const compactPrompt =/);
  assert.match(itemSource, /title=\{compactPrompt\}/);
  assert.doesNotMatch(itemSource, /title=\{item\.prompt\}/);
  assert.doesNotMatch(itemSource, /replace\(\/\\s\+\/g/);
});

test("history deletion handler stays stable across active selection changes", () => {
  assert.match(historyHookSource, /setActiveHistoryId\(\(currentActiveHistoryId\) =>/);
  assert.doesNotMatch(historyHookSource, /removeHistory[\s\S]*\[activeHistoryId\]/);
});
