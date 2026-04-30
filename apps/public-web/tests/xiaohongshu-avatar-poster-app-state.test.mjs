import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadXiaohongshuAvatarPosterAppState() {
  const source = readFileSync(
    new URL("../src/features/prompt-apps/xiaohongshu-avatar-poster-app-state.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    Error,
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "./prompt-apps") {
        return {
          buildXiaohongshuAvatarPosterPrompt: ({ characterNote }) => `人物=${characterNote.trim()}`,
        };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("canSubmitXiaohongshuAvatarPoster requires model and uploaded source image", () => {
  const { canSubmitXiaohongshuAvatarPoster } = loadXiaohongshuAvatarPosterAppState();

  assert.equal(canSubmitXiaohongshuAvatarPoster({ modelCode: "gpt-image-2", sourceAssetId: 18 }), true);
  assert.equal(canSubmitXiaohongshuAvatarPoster({ modelCode: "   ", sourceAssetId: 18 }), false);
  assert.equal(canSubmitXiaohongshuAvatarPoster({ modelCode: "gpt-image-2", sourceAssetId: null }), false);
});

test("buildXiaohongshuAvatarPosterImageRequest always uses edit source image", () => {
  const { buildXiaohongshuAvatarPosterImageRequest } = loadXiaohongshuAvatarPosterAppState();
  const request = buildXiaohongshuAvatarPosterImageRequest(
    { characterNote: "  红色冲锋衣、夸张跑步姿态  " },
    "gpt-image-2",
    18,
  );

  assert.equal(request.model_code, "gpt-image-2");
  assert.equal(request.requested_count, 1);
  assert.equal(request.mode, "edit");
  assert.equal(request.source_asset_id, 18);
  assert.equal(request.prompt, "人物=红色冲锋衣、夸张跑步姿态");
});

test("getXiaohongshuAvatarPosterErrorMessage extracts Error message", () => {
  const { getXiaohongshuAvatarPosterErrorMessage } = loadXiaohongshuAvatarPosterAppState();

  assert.equal(getXiaohongshuAvatarPosterErrorMessage(new Error("源图上传失败")), "源图上传失败");
  assert.equal(getXiaohongshuAvatarPosterErrorMessage("failed"), "创建任务失败");
});
