import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadSilhouetteUniversePosterAppState() {
  const source = readFileSync(
    new URL("../src/features/prompt-apps/silhouette-universe-poster-app-state.ts", import.meta.url),
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
          buildSilhouetteUniversePosterPrompt: ({ topic, note }) =>
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

test("canSubmitSilhouetteUniversePoster requires topic and model after trim", () => {
  const { canSubmitSilhouetteUniversePoster } = loadSilhouetteUniversePosterAppState();

  assert.equal(canSubmitSilhouetteUniversePoster({ topic: "   ", modelCode: "gpt-image-2" }), false);
  assert.equal(canSubmitSilhouetteUniversePoster({ topic: "海底图书馆", modelCode: "   " }), false);
  assert.equal(canSubmitSilhouetteUniversePoster({ topic: "  海底图书馆  ", modelCode: "gpt-image-2" }), true);
});

test("buildSilhouetteUniversePosterImageRequest fixes count and generate mode", () => {
  const { buildSilhouetteUniversePosterImageRequest } = loadSilhouetteUniversePosterAppState();
  const request = buildSilhouetteUniversePosterImageRequest(
    { topic: " 海底图书馆 ", note: " 偏神圣、安静 " },
    "gpt-image-2",
  );

  assert.equal(request.model_code, "gpt-image-2");
  assert.equal(request.requested_count, 1);
  assert.equal(request.mode, "generate");
  assert.equal(request.prompt, "主题=海底图书馆;备注=偏神圣、安静");
});

test("getSilhouetteUniversePosterErrorMessage extracts Error message", () => {
  const { getSilhouetteUniversePosterErrorMessage } = loadSilhouetteUniversePosterAppState();

  assert.equal(getSilhouetteUniversePosterErrorMessage(new Error("额度不足")), "额度不足");
});
