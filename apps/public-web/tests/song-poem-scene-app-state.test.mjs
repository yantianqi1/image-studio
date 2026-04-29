import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const stateFile = new URL("../src/features/prompt-apps/song-poem-scene-app-state.ts", import.meta.url);

function loadSongPoemSceneAppState() {
  assert.equal(existsSync(stateFile), true, "song poem scene app state helper should exist");
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
          buildSongPoemScenePrompt: ({ poem, note }) =>
            `小诗=${poem.trim()};备注=${note.trim()}`,
        };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("canSubmitSongPoemScene requires poem and model after trim", () => {
  const { canSubmitSongPoemScene } = loadSongPoemSceneAppState();

  assert.equal(canSubmitSongPoemScene({ poem: "   ", modelCode: "gpt-image-2" }), false);
  assert.equal(canSubmitSongPoemScene({ poem: "墙里秋千墙外道", modelCode: "   " }), false);
  assert.equal(canSubmitSongPoemScene({ poem: "  墙里秋千墙外道  ", modelCode: "gpt-image-2" }), true);
});

test("buildSongPoemSceneImageRequest fixes count and generate mode", () => {
  const { buildSongPoemSceneImageRequest } = loadSongPoemSceneAppState();
  const request = buildSongPoemSceneImageRequest(
    { poem: " 墙里秋千墙外道 ", note: " 光影更清亮 " },
    "gpt-image-2",
  );

  assert.equal(request.model_code, "gpt-image-2");
  assert.equal(request.requested_count, 1);
  assert.equal(request.mode, "generate");
  assert.equal(request.prompt, "小诗=墙里秋千墙外道;备注=光影更清亮");
});

test("getSongPoemSceneErrorMessage extracts Error message", () => {
  const { getSongPoemSceneErrorMessage } = loadSongPoemSceneAppState();

  assert.equal(getSongPoemSceneErrorMessage(new Error("额度不足")), "额度不足");
});
