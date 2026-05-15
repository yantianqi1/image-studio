import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const composerSource = readFileSync(
  new URL("../src/features/studio/studio-composer.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/features/studio/studio-page.tsx", import.meta.url),
  "utf8",
);
const resultsSource = readFileSync(
  new URL("../src/features/studio/studio-results.tsx", import.meta.url),
  "utf8",
);

function loadRequestMode() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-request-mode.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("studio composer merges generate and edit into one image workspace", () => {
  assert.doesNotMatch(composerSource, /label:\s*"编辑"/);
  assert.doesNotMatch(composerSource, /value:\s*"edit"/);
  assert.match(composerSource, /label:\s*"生图"/);
});

test("studio composer exposes compliance tooltip and prompt optimization action", () => {
  assert.match(composerSource, /title="将提示词合规化"/);
  assert.match(composerSource, /handlePromptOptimization/);
  assert.match(composerSource, /"优化"/);
});

test("studio turns can be deleted and retry reuses the original turn", () => {
  assert.match(resultsSource, /onDeleteTurn/);
  assert.match(resultsSource, /aria-label="删除记录"/);
  assert.match(pageSource, /handleDeleteTurn/);
  assert.match(pageSource, /conversations\.removeTurn\(conv\.id, turnId\)/);
  assert.match(pageSource, /conversations\.retryTurn\(conv\.id, turnId\)/);
  assert.match(pageSource, /contextBeforeTurnId:\s*turn\.id/);
  assert.doesNotMatch(pageSource, /conversations\.removeTurn\(conv\.id, turnId\)[\s\S]*submitDraft\(draft\)/);
});

test("studio request mode infers edit only when image workspace has references", () => {
  const { resolveStudioDraftMode } = loadRequestMode();

  assert.equal(resolveStudioDraftMode({ composerMode: "chat", referenceCount: 0 }), "chat");
  assert.equal(resolveStudioDraftMode({ composerMode: "generate", referenceCount: 0 }), "generate");
  assert.equal(resolveStudioDraftMode({ composerMode: "generate", referenceCount: 1 }), "edit");
});

test("studio submission lock is scoped to the active conversation only", () => {
  assert.match(pageSource, /submittingConversationIds/);
  assert.match(pageSource, /isActiveConversationSubmitting/);
  assert.doesNotMatch(pageSource, /const \[isSubmitting, setIsSubmitting\]/);
  assert.doesNotMatch(pageSource, /if \(!prompt\.trim\(\) \|\| isSubmitting\) return/);
});

test("studio starts image polling without blocking new submissions", () => {
  assert.match(pageSource, /void pollSubmittedImageJob/);
  assert.doesNotMatch(pageSource, /await waitForImageJobResults\(publicApi, job\.id/);
});

test("studio results reserve space for the fixed mobile composer", () => {
  assert.match(composerSource, /onFixedHeightChange/);
  assert.match(composerSource, /style\.position === "fixed"/);
  assert.match(pageSource, /composerBottomInset/);
  assert.match(pageSource, /bottomInset=\{composerBottomInset\}/);
  assert.match(resultsSource, /FIXED_COMPOSER_CLEARANCE/);
  assert.match(resultsSource, /paddingBottom: bottomInset \+ FIXED_COMPOSER_CLEARANCE/);
});
