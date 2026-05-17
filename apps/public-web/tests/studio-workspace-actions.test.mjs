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
const appShellSource = readFileSync(
  new URL("../src/features/shell/app-shell.tsx", import.meta.url),
  "utf8",
);
const appHeaderStylesSource = readFileSync(
  new URL("../src/features/shell/app-header.module.css", import.meta.url),
  "utf8",
);
const characterLibrarySource = readFileSync(
  new URL("../src/features/studio/studio-character-library.tsx", import.meta.url),
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

test("studio composer exposes character library picker", () => {
  assert.match(composerSource, /onOpenCharacterLibrary/);
  assert.match(composerSource, /"形象库"/);
  assert.match(pageSource, /StudioCharacterLibrary/);
  assert.match(pageSource, /characterLibraryIds/);
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

test("studio result prompt bubble exposes parameters and edit retry", () => {
  assert.match(resultsSource, /formatTurnParameters/);
  assert.match(resultsSource, /Pencil/);
  assert.match(resultsSource, /aria-label="修改提示词"/);
  assert.match(resultsSource, /onEditPromptRetry/);
  assert.match(pageSource, /handleEditPromptRetry/);
  assert.match(pageSource, /retryTurnWithPrompt/);
});

test("studio first image turn requests backend generated conversation title", () => {
  assert.match(pageSource, /applyGeneratedTitle/);
  assert.match(pageSource, /job\.title/);
  assert.match(pageSource, /renameConversation/);
  assert.match(pageSource, /autoTitle:\s*input\.applyGeneratedTitle/);
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

test("studio surfaces anonymous image concurrency limit as a dismissible notice", () => {
  assert.match(pageSource, /anonymous_image_job_concurrency_limit/);
  assert.match(pageSource, /SubmissionNotice/);
  assert.match(pageSource, /submissionNotice/);
  assert.match(pageSource, /role="status"/);
});

test("studio results reserve space for the fixed mobile composer", () => {
  assert.match(composerSource, /onFixedHeightChange/);
  assert.match(composerSource, /window\.innerWidth >= FIXED_COMPOSER_STATIC_MIN_WIDTH_PX/);
  assert.match(composerSource, /style\.position === "fixed"/);
  assert.match(pageSource, /composerBottomInset/);
  assert.match(pageSource, /bottomInset=\{composerBottomInset\}/);
  assert.match(resultsSource, /FIXED_COMPOSER_CLEARANCE/);
  assert.match(resultsSource, /paddingBottom: bottomInset \+ FIXED_COMPOSER_CLEARANCE/);
});

test("studio workspace compacts the shell header and hides the global prompt crafter FAB", () => {
  assert.match(appShellSource, /GlobalPromptCrafter disabled=\{workspaceMode\}/);
  assert.match(appShellSource, /workspaceMode: boolean/);
  assert.match(appHeaderStylesSource, /\.workspaceHeader \.mobileNav \{\n\s+display: none;/);
  assert.match(appHeaderStylesSource, /\.workspaceHeader \.brandName,/);
});

test("studio mobile empty workspace renders presets as a grid instead of a sideways strip", () => {
  assert.match(resultsSource, /hidden text-3xl font-medium leading-tight text-gray-900 sm:block sm:text-5xl/);
  assert.match(resultsSource, /grid grid-cols-2 gap-3 px-1 text-left lg:grid-cols-4/);
  assert.match(resultsSource, /PresetSkeletonGrid/);
  assert.match(resultsSource, /PRESET_SKELETON_COUNT = 4/);
  assert.match(resultsSource, /grid-cols-1 max-w-\[240px\] sm:max-w-\[360px\]/);
});

test("studio composer mobile toolbar scrolls and the settings panel expands to a wide sheet", () => {
  assert.match(composerSource, /overflow-x-auto pb-1 pr-1/);
  assert.match(composerSource, /shrink-0 sm:relative/);
  assert.match(composerSource, /left-0 right-0 z-\[80\] max-h-\[min\(58dvh,28rem\)\] w-auto/);
});

test("studio character library opens as a mobile bottom sheet and keeps delete controls reachable", () => {
  assert.match(characterLibrarySource, /fixed inset-x-0 bottom-0 z-50 flex h-\[88dvh\] w-full/);
  assert.match(characterLibrarySource, /grid-rows-\[auto_minmax\(0,1fr\)\]/);
  assert.match(characterLibrarySource, /grid grid-cols-3 gap-2/);
  assert.match(characterLibrarySource, /opacity-100[^]*sm:opacity-0[^]*sm:group-hover:opacity-100/);
});
