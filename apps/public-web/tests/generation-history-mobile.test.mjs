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

const appShellSource = readFileSync(
  new URL("../src/features/shell/app-shell.tsx", import.meta.url),
  "utf8",
);

const workbenchCss = readFileSync(
  new URL("../src/features/home/generation-workbench.module.css", import.meta.url),
  "utf8",
);

const comicWorkspaceCss = readFileSync(
  new URL("../src/features/comic/comic-workspace.module.css", import.meta.url),
  "utf8",
);

const comicStoryboardCss = readFileSync(
  new URL("../src/features/comic/comic-storyboard.module.css", import.meta.url),
  "utf8",
);

const comicPreviewCss = readFileSync(
  new URL("../src/features/comic/comic-preview.module.css", import.meta.url),
  "utf8",
);

const comicProjectCss = readFileSync(
  new URL("../src/features/comic/comic-project.module.css", import.meta.url),
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
  assert.match(mobileBlock, /overflow:\s*visible;/);
  assert.match(mobileBlock, /\.resultPanel\s*\{[\s\S]*height:\s*auto;/);
  assert.doesNotMatch(mobileBlock, /overflow-y:\s*auto;/);
  assert.doesNotMatch(mobileBlock, /min-height:\s*620px;/);
});

test("workspace shell uses natural page scrolling on mobile", () => {
  const workspaceClass = appShellSource.match(/workspaceMode \? "([^"]+)"/)?.[1] ?? "";
  const classNames = workspaceClass.split(/\s+/);

  assert.ok(classNames.includes("min-h-[calc(100dvh-7rem)]"));
  assert.ok(classNames.includes("md:h-[calc(100dvh-4rem)]"));
  assert.ok(classNames.includes("md:overflow-hidden"));
  assert.ok(!classNames.includes("h-[calc(100dvh-7rem)]"));
  assert.ok(!classNames.includes("overflow-hidden"));
});

test("mobile comic workspace avoids nested scroll panels", () => {
  const workspaceMobileBlock = comicWorkspaceCss.match(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\n\}/)?.[0] ?? "";
  const storyboardMobileBlock = comicStoryboardCss.match(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\n\}/)?.[0] ?? "";
  const previewMobileBlock = comicPreviewCss.match(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\n\}/)?.[0] ?? "";
  const projectMobileBlock = comicProjectCss.match(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\n\}/)?.[0] ?? "";

  assert.match(workspaceMobileBlock, /\.workspace\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(workspaceMobileBlock, /\.panelScroll\s*\{[\s\S]*overflow:\s*visible;/);
  assert.doesNotMatch(workspaceMobileBlock, /overflow-y:\s*auto;/);
  assert.doesNotMatch(workspaceMobileBlock, /min-height:\s*520px;/);
  assert.match(storyboardMobileBlock, /\.storyboardList\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(previewMobileBlock, /\.previewGrid\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(projectMobileBlock, /\.eventStream ol\s*\{[\s\S]*overflow:\s*visible;/);
});
