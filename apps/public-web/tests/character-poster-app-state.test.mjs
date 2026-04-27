import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadCharacterPosterAppState() {
  const source = readFileSync(
    new URL("../src/features/prompt-apps/character-poster-app-state.ts", import.meta.url),
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
          buildCharacterPosterPrompt: ({ character, note }) =>
            `角色=${character.trim()};备注=${note.trim()}`,
        };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("canSubmitCharacterPoster requires character after trim", () => {
  const { canSubmitCharacterPoster } = loadCharacterPosterAppState();

  assert.equal(canSubmitCharacterPoster({ character: "   ", modelCode: "gpt-image-2" }), false);
  assert.equal(canSubmitCharacterPoster({ character: "  张夏  ", modelCode: "gpt-image-2" }), true);
});

test("buildCharacterPosterImageRequest fixes count and mode", () => {
  const { buildCharacterPosterImageRequest } = loadCharacterPosterAppState();
  const request = buildCharacterPosterImageRequest(
    { character: " 张夏 ", note: " 青山女主 " },
    "gpt-image-2",
  );

  assert.equal(request.model_code, "gpt-image-2");
  assert.equal(request.requested_count, 1);
  assert.equal(request.mode, "generate");
  assert.equal(request.prompt, "角色=张夏;备注=青山女主");
});

test("getCharacterPosterErrorMessage extracts Error message", () => {
  const { getCharacterPosterErrorMessage } = loadCharacterPosterAppState();

  assert.equal(getCharacterPosterErrorMessage(new Error("余额不足")), "余额不足");
});
