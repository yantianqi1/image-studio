import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebarSource = readFileSync(
  new URL("../src/features/home/generation-history-sidebar.tsx", import.meta.url),
  "utf8",
);

const sidebarCss = readFileSync(
  new URL("../src/features/home/generation-history.module.css", import.meta.url),
  "utf8",
);

const workbenchCss = readFileSync(
  new URL("../src/features/home/generation-workbench.module.css", import.meta.url),
  "utf8",
);

test("generation history sidebar uses module-owned responsive display rules", () => {
  assert.match(sidebarSource, /styles\.desktopSidebar/);
  assert.doesNotMatch(sidebarSource, /hidden lg:flex/);
  assert.match(sidebarCss, /\.desktopSidebar\s*\{\s*display:\s*none;/);
  assert.match(sidebarCss, /@media\s*\(min-width:\s*1024px\)[\s\S]*\.desktopSidebar\s*\{\s*display:\s*flex;/);
});

test("mobile generation workspace stacks rows by content height", () => {
  const mobileBlock = workbenchCss.match(/@media\s*\(max-width:\s*1023px\)\s*\{[\s\S]*\n\}/)?.[0] ?? "";

  assert.match(mobileBlock, /grid-auto-rows:\s*max-content;/);
  assert.match(mobileBlock, /align-content:\s*start;/);
  assert.match(mobileBlock, /\.resultPanel\s*\{[\s\S]*height:\s*auto;/);
});
