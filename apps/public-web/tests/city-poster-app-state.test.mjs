import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const stateFile = new URL("../src/features/prompt-apps/city-poster-app-state.ts", import.meta.url);

function loadCityPosterAppState() {
  assert.equal(existsSync(stateFile), true, "city poster app state helper should exist");
  const source = readFileSync(stateFile, "utf8");
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
          buildCityPosterPrompt: ({ city, note }) =>
            `城市=${city.trim()};备注=${note.trim()}`,
        };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("canSubmitCityPoster requires city and model after trim", () => {
  const { canSubmitCityPoster } = loadCityPosterAppState();

  assert.equal(canSubmitCityPoster({ city: "   ", modelCode: "gpt-image-2" }), false);
  assert.equal(canSubmitCityPoster({ city: "杭州", modelCode: "   " }), false);
  assert.equal(canSubmitCityPoster({ city: "  杭州  ", modelCode: "gpt-image-2" }), true);
});

test("buildCityPosterImageRequest fixes count and generate mode", () => {
  const { buildCityPosterImageRequest } = loadCityPosterAppState();
  const request = buildCityPosterImageRequest(
    { city: " 杭州 ", note: " 突出西湖、钱塘江 " },
    "gpt-image-2",
  );

  assert.equal(request.model_code, "gpt-image-2");
  assert.equal(request.requested_count, 1);
  assert.equal(request.mode, "generate");
  assert.equal(request.prompt, "城市=杭州;备注=突出西湖、钱塘江");
});

test("getCityPosterErrorMessage extracts Error message", () => {
  const { getCityPosterErrorMessage } = loadCityPosterAppState();

  assert.equal(getCityPosterErrorMessage(new Error("图片生成失败")), "图片生成失败");
});
