import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadKoreanIdolContactSheetAppState() {
  const source = readFileSync(
    new URL("../src/features/prompt-apps/korean-idol-contact-sheet-app-state.ts", import.meta.url),
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
          buildKoreanIdolContactSheetPrompt: ({ note }) => `备注=${note.trim()}`,
        };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("canSubmitKoreanIdolContactSheet requires source image and model after trim", () => {
  const { canSubmitKoreanIdolContactSheet } = loadKoreanIdolContactSheetAppState();

  assert.equal(canSubmitKoreanIdolContactSheet({ sourceAssetId: null, modelCode: "gpt-image-2" }), false);
  assert.equal(canSubmitKoreanIdolContactSheet({ sourceAssetId: 12, modelCode: "   " }), false);
  assert.equal(canSubmitKoreanIdolContactSheet({ sourceAssetId: 12, modelCode: "gpt-image-2" }), true);
});

test("buildKoreanIdolContactSheetImageRequest fixes count and edit source", () => {
  const { buildKoreanIdolContactSheetImageRequest } = loadKoreanIdolContactSheetAppState();
  const request = buildKoreanIdolContactSheetImageRequest(
    { note: " 偏清晨、干净室内 " },
    "gpt-image-2",
    12,
  );

  assert.equal(request.model_code, "gpt-image-2");
  assert.equal(request.requested_count, 1);
  assert.equal(request.mode, "edit");
  assert.equal(request.source_asset_id, 12);
  assert.equal(request.prompt, "备注=偏清晨、干净室内");
});

test("getKoreanIdolContactSheetErrorMessage extracts Error message", () => {
  const { getKoreanIdolContactSheetErrorMessage } = loadKoreanIdolContactSheetAppState();

  assert.equal(getKoreanIdolContactSheetErrorMessage(new Error("源图上传失败")), "源图上传失败");
});
