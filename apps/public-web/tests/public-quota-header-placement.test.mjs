import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShellSource = readFileSync(
  new URL("../src/features/shell/app-shell.tsx", import.meta.url),
  "utf8",
);

const quotaSource = readFileSync(
  new URL("../src/features/shell/public-quota-status.tsx", import.meta.url),
  "utf8",
);

test("public quota display is mounted in the right action cluster", () => {
  assert.match(appShellSource, /<div className=\{styles\.actions\}>[\s\S]*<PublicQuotaStatusBadge \/>/);
  assert.doesNotMatch(appShellSource, /<PublicQuotaStatusBar/);
});

test("public quota display uses a compact header badge", () => {
  assert.match(quotaSource, /export function PublicQuotaStatusBadge/);
  assert.match(quotaSource, /aria-label=\{`今日次数/);
});
