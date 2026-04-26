import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadComicStatus() {
  const rawSource = readFileSync(new URL("../src/features/comic/comic-status.tsx", import.meta.url), "utf8");
  const source = rawSource.replace(
    'import styles from "./comic-workspace.module.css";',
    'const styles = new Proxy({}, { get: (_target, key) => String(key) });',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require: () => ({ jsx: () => null, jsxs: () => null }),
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("project-created-without-task status exposes actionable copy", () => {
  const { statusDescription, statusLabel, toStatusTone } = loadComicStatus();

  assert.equal(toStatusTone("project_created_no_task"), "idle");
  assert.equal(statusLabel("project_created_no_task"), "项目已创建，尚未创建生成任务");
  assert.equal(statusDescription("project_created_no_task"), "项目记录已保存，但后端还没有生成任务；如果长时间停留在这里，请重新提交。每一步失败都会显示具体错误。");
});

test("workflow status descriptions explain the current backend step", () => {
  const { statusDescription, statusLabel, toStatusTone } = loadComicStatus();

  assert.equal(toStatusTone("llm_processing"), "planning");
  assert.equal(statusLabel("llm_processing"), "LLM Agent 处理中");
  assert.equal(statusDescription("llm_processing"), "后端任务正在运行：解析剧情、生成角色设定、拆分分镜并写入数据库。");
  assert.equal(statusLabel("storyboarding"), "分镜生成中");
  assert.equal(statusDescription("storyboarding"), "LLM 正在按剧情分段生成多张漫画页分镜。");
  assert.equal(statusDescription("page_image_generating"), "漫画图片任务已提交，正在等待图像结果写回；失败会显示具体错误。")
});

test("failed status displays failure label", () => {
  const { statusDescription, statusLabel, toStatusTone } = loadComicStatus();

  assert.equal(toStatusTone("failed"), "failed");
  assert.equal(statusLabel("failed"), "失败");
  assert.equal(statusDescription("failed"), "流程已失败，请查看错误信息；不会用假进度伪装成功。");
});
