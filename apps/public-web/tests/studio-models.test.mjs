import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const aspectRatioOptions = [
  {
    value: "1:1",
    label: "1:1",
    description: "正方形",
    resolutions: [{ value: "1024x1024", label: "标准", pixels: "1024×1024" }],
  },
  {
    value: "3:2",
    label: "3:2",
    description: "横版",
    resolutions: [{ value: "1536x1024", label: "标准", pixels: "1536×1024" }],
  },
];

function loadStudioModels() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-models.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require(specifier) {
      if (specifier === "@/features/studio/studio-aspect-ratio") {
        return { ASPECT_RATIO_OPTIONS: aspectRatioOptions };
      }
      throw new Error(`Unexpected import: ${specifier}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

function buildImageModel(code = "gpt-image-2") {
  return {
    id: 1,
    code,
    display_name: code,
    capability: "image",
    provider_id: 1,
    provider_model: code,
    public_enabled: true,
  };
}

test("studio model catalog no longer depends on public price variants", () => {
  const { buildModelAspectRatioOptions, getModelQualityOptions } = loadStudioModels();
  const model = buildImageModel();

  assert.deepEqual(toPlain(buildModelAspectRatioOptions(model)), []);
  assert.deepEqual(toPlain(getModelQualityOptions(model, "1024x1024")), []);
});

test("studio model selection preserves parameters without public variants", () => {
  const { resolveModelParameterSelection } = loadStudioModels();
  const model = buildImageModel();
  const current = {
    aspectRatio: "3:2",
    resolution: "1536x1024",
    quality: "medium",
  };

  assert.deepEqual(toPlain(resolveModelParameterSelection(model, current)), current);
});

test("studio image model resolver keeps image models selectable", () => {
  const { filterImageModels, resolveImageModel } = loadStudioModels();
  const models = [
    buildImageModel("gpt-image-2"),
    buildImageModel("gpt-image-2-openrouter"),
    { ...buildImageModel("chat-only"), capability: "chat" },
  ];

  const resolved = resolveImageModel(models, "gpt-image-2-openrouter");

  assert.deepEqual(toPlain(filterImageModels(models).map((model) => model.code)), [
    "gpt-image-2",
    "gpt-image-2-openrouter",
  ]);
  assert.equal(resolved.selectedModel.code, "gpt-image-2-openrouter");
});

test("studio model helper still resolves built-in aspect ratio options", () => {
  const { findModelAspectRatioOption } = loadStudioModels();

  assert.equal(findModelAspectRatioOption(null, "3:2").resolutions[0].value, "1536x1024");
});

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}
