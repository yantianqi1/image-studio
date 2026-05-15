import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const pageFile = new URL("../src/app/apps/prompt-crafter/page.tsx", import.meta.url);
const appFile = new URL("../src/features/prompt-crafter/prompt-crafter-app.tsx", import.meta.url);
const apiFile = new URL("../src/features/prompt-crafter/prompt-crafter-api.ts", import.meta.url);
const markdownFile = new URL("../src/features/prompt-crafter/prompt-markdown.ts", import.meta.url);
const markdownViewFile = new URL("../src/features/prompt-crafter/prompt-markdown-view.tsx", import.meta.url);
const markdownStylesFile = new URL("../src/features/prompt-crafter/prompt-markdown.module.css", import.meta.url);
const stylesFile = new URL("../src/features/prompt-crafter/prompt-crafter.module.css", import.meta.url);

function readRequiredSource(file, label) {
  assert.equal(existsSync(file), true, `${label} should exist`);
  return readFileSync(file, "utf8");
}

function loadPromptMarkdown() {
  const source = readRequiredSource(markdownFile, "prompt markdown parser");
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

test("prompt crafter route renders the app component", () => {
  const pageSource = readRequiredSource(pageFile, "prompt crafter route");

  assert.match(pageSource, /import \{ PromptCrafterApp \}/);
  assert.match(pageSource, /return <PromptCrafterApp \/>/);
});

test("prompt crafter page exposes a streaming workspace", () => {
  const appSource = readRequiredSource(appFile, "prompt crafter app");
  const apiSource = readRequiredSource(apiFile, "prompt crafter api");
  const markdownViewSource = readRequiredSource(markdownViewFile, "prompt markdown view");
  const markdownStylesSource = readRequiredSource(markdownStylesFile, "prompt markdown styles");
  const stylesSource = readRequiredSource(stylesFile, "prompt crafter styles");

  assert.match(appSource, /headerTitle="提示词工坊"/);
  assert.match(appSource, /aria-label="返回应用中心"/);
  assert.match(appSource, /生成提示词/);
  assert.match(appSource, /继续优化/);
  assert.match(appSource, /发送到生图/);
  assert.match(appSource, /streamPromptCrafter/);
  assert.match(appSource, /PromptMarkdownView/);
  assert.match(markdownViewSource, /复制生成提示词/);
  assert.match(markdownViewSource, /copyGeneratedPrompt/);
  assert.match(apiSource, /\/prompt-crafter\/chat\/stream/);
  assert.match(apiSource, /readPromptCrafterEventStream/);
  assert.match(stylesSource, /\.workspace\s*\{[\s\S]*grid-template-columns:/);
  assert.match(markdownStylesSource, /\.markdownShell\s*\{/);
  assert.match(markdownStylesSource, /\.copyButton\s*\{/);
  assert.match(markdownStylesSource, /\.markdown h2/);
  assert.match(markdownStylesSource, /\.markdown blockquote/);
  assert.match(markdownStylesSource, /\.markdown pre/);
  assert.match(markdownStylesSource, /linear-gradient\(180deg, #fbfdff 0%, #f4f8fc 100%\)/);
  assert.match(markdownStylesSource, /white-space:\s*pre-wrap;/);
  assert.match(stylesSource, /@media \(max-width:\s*640px\)/);
  assert.equal(existsSync(markdownViewFile), true);
});

test("prompt crafter page keeps skill internals out of the UI source", () => {
  const appSource = readRequiredSource(appFile, "prompt crafter app");

  assert.doesNotMatch(appSource, /Human-Subject Photography/);
  assert.doesNotMatch(appSource, /Face detail recipes/);
  assert.doesNotMatch(appSource, /Default Output/);
});

test("prompt markdown parser extracts common markdown blocks", () => {
  const { parsePromptMarkdown } = loadPromptMarkdown();
  const blocks = JSON.parse(JSON.stringify(parsePromptMarkdown("## 标题\n\n- 镜头\n- 光线\n\n```text\nprompt\n```")));

  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: "标题" },
    { type: "unordered-list", items: ["镜头", "光线"] },
    { type: "code", language: "text", code: "prompt" },
  ]);
});

test("prompt markdown parser extracts three usable prompt options", () => {
  const { extractPromptOptionsFromMarkdown } = loadPromptMarkdown();
  const markdown = [
    "## 方案 1：电影感人像",
    "```prompt",
    "生成一张雨后街道人像。",
    "```",
    "## 方案 2：产品视觉",
    "```prompt",
    "生成一张咖啡包装主视觉。",
    "```",
    "## 方案 3：海报设计",
    "```prompt",
    "生成一张城市文化海报。",
    "```",
  ].join("\n");

  assert.deepEqual(JSON.parse(JSON.stringify(extractPromptOptionsFromMarkdown(markdown))), [
    { title: "方案 1：电影感人像", prompt: "生成一张雨后街道人像。" },
    { title: "方案 2：产品视觉", prompt: "生成一张咖啡包装主视觉。" },
    { title: "方案 3：海报设计", prompt: "生成一张城市文化海报。" },
  ]);
});

test("prompt crafter drawer exposes per-option use actions", () => {
  const drawerSource = readRequiredSource(
    new URL("../src/features/prompt-crafter/prompt-crafter-drawer.tsx", import.meta.url),
    "prompt crafter drawer",
  );
  const markdownViewSource = readRequiredSource(markdownViewFile, "prompt markdown view");

  assert.match(drawerSource, /onUsePrompt=\{handleUsePrompt\}/);
  assert.match(markdownViewSource, /extractPromptOptionsFromMarkdown/);
  assert.match(markdownViewSource, /使用/);
});
