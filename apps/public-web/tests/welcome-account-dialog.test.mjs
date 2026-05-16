import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShellSource = readSource("../src/features/shell/app-shell.tsx");
const dialogSource = readSource("../src/features/shell/welcome-account-dialog.tsx");
const studioPageSource = readSource("../src/features/studio/studio-page.tsx");

test("welcome account dialog is controlled instead of opening on first mount", () => {
  assert.match(dialogSource, /type WelcomeAccountDialogProps/);
  assert.match(dialogSource, /open:\s*boolean/);
  assert.match(dialogSource, /if \(!props\.open\) return null/);
  assert.match(dialogSource, /shouldShowWelcomeAccountDialog/);
  assert.doesNotMatch(dialogSource, /checking/);
  assert.doesNotMatch(dialogSource, /setState\("open"\)/);
  assert.doesNotMatch(dialogSource, /welcome-account-dismissed/);
});

test("studio send action owns the welcome dialog trigger", () => {
  assert.doesNotMatch(appShellSource, /WelcomeAccountDialog/);
  assert.match(studioPageSource, /WelcomeAccountDialog/);
  assert.match(studioPageSource, /welcomeAccountDialogOpen/);
  assert.match(studioPageSource, /shouldShowWelcomeAccountDialog/);
  assert.match(studioPageSource, /setWelcomeAccountDialogOpen\(true\)/);
  assert.match(studioPageSource, /onAnonymousReady=\{handleAnonymousWelcomeUse\}/);
});

test("studio does not clear the prompt before the welcome gate resolves", () => {
  const submitGateIndex = studioPageSource.indexOf("shouldShowWelcomeAccountDialog");
  const clearPromptIndex = studioPageSource.indexOf("setPrompt(\"\")");

  assert.notEqual(submitGateIndex, -1, "submit gate check not found");
  assert.notEqual(clearPromptIndex, -1, "prompt clearing not found");
  assert.ok(submitGateIndex < clearPromptIndex, "prompt is cleared before the account dialog gate");
});

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
