import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadEncyclopediaCardAppState() {
  const source = readFileSync(
    new URL("../src/features/prompt-apps/encyclopedia-card-app-state.ts", import.meta.url),
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
          buildEncyclopediaCardPrompt: ({ topic, note }) =>
            `主题=${topic.trim()};备注=${note.trim()}`,
        };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("canSubmitEncyclopediaCard requires topic and model after trim", () => {
  const { canSubmitEncyclopediaCard } = loadEncyclopediaCardAppState();

  assert.equal(canSubmitEncyclopediaCard({ topic: "   ", modelCode: "gpt-image-2" }), false);
  assert.equal(canSubmitEncyclopediaCard({ topic: "狸花猫", modelCode: "   " }), false);
  assert.equal(canSubmitEncyclopediaCard({ topic: "  狸花猫  ", modelCode: "gpt-image-2" }), true);
});

test("buildEncyclopediaCardImageRequest fixes count and generate mode", () => {
  const { buildEncyclopediaCardImageRequest } = loadEncyclopediaCardAppState();
  const request = buildEncyclopediaCardImageRequest(
    { topic: " 狸花猫 ", note: " 适合新手养猫家庭 " },
    "gpt-image-2",
  );

  assert.equal(request.model_code, "gpt-image-2");
  assert.equal(request.requested_count, 1);
  assert.equal(request.mode, "generate");
  assert.equal(request.prompt, "主题=狸花猫;备注=适合新手养猫家庭");
});

test("getEncyclopediaCardErrorMessage extracts Error message", () => {
  const { getEncyclopediaCardErrorMessage } = loadEncyclopediaCardAppState();

  assert.equal(getEncyclopediaCardErrorMessage(new Error("额度不足")), "额度不足");
});
