import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPreviewUtils() {
  const source = readFileSync(new URL("../src/features/comic/comic-preview-utils.ts", import.meta.url), "utf8");
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

const shots = [
  { id: "one", index: 1, assetUrl: "/one.png" },
  { id: "two", index: 2, assetUrl: "/two.png" },
  { id: "three", index: 3, assetUrl: null },
];

test("selectAdjacentShotId moves from the active shot", () => {
  const { selectAdjacentShotId } = loadPreviewUtils();

  assert.equal(selectAdjacentShotId({ shots, selectedShotId: "two", direction: "previous" }), "one");
  assert.equal(selectAdjacentShotId({ shots, selectedShotId: "two", direction: "next" }), "three");
  assert.equal(selectAdjacentShotId({ shots, selectedShotId: "one", direction: "previous" }), null);
});

test("download names use sanitized project title and page order", () => {
  const { buildSequentialImageName, buildStitchedImageName } = loadPreviewUtils();

  assert.equal(buildSequentialImageName({ projectTitle: "测试/章节", index: 2 }), "测试-章节-2");
  assert.equal(buildStitchedImageName("测试/章节"), "测试-章节");
});

test("getExportableShots only includes shots with real assets", () => {
  const { getExportableShots } = loadPreviewUtils();

  assert.deepEqual(getExportableShots(shots).map((shot) => shot.id), ["one", "two"]);
});
