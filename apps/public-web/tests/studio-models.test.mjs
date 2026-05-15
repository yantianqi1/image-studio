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
  {
    value: "2:3",
    label: "2:3",
    description: "竖图",
    resolutions: [{ value: "1024x1536", label: "标准", pixels: "1024×1536" }],
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

function buildOfficialModel() {
  return {
    code: "gpt-image-2-official",
    display_name: "GPT Image 2 官方通道",
    capability: "image",
    member_price_cents: 130,
    variants: [
      { size: "1024x1024", quality: "low", member_price_cents: 20 },
      { size: "1024x1024", quality: "medium", member_price_cents: 130 },
      { size: "1024x1024", quality: "high", member_price_cents: 480 },
      { size: "1024x1536", quality: "low", member_price_cents: 20 },
      { size: "1024x1536", quality: "medium", member_price_cents: 100 },
      { size: "1024x1536", quality: "high", member_price_cents: 370 },
      { size: "1536x1024", quality: "low", member_price_cents: 20 },
      { size: "1536x1024", quality: "medium", member_price_cents: 100 },
      { size: "1536x1024", quality: "high", member_price_cents: 370 },
    ],
  };
}

test("studio model options are driven by official channel variants", () => {
  const { buildModelAspectRatioOptions, getModelQualityOptions } = loadStudioModels();
  const model = buildOfficialModel();

  const ratios = buildModelAspectRatioOptions(model);
  assert.deepEqual(toPlain(ratios.map((ratio) => ratio.value)), ["1:1", "2:3", "3:2"]);
  assert.deepEqual(toPlain(ratios.map((ratio) => ratio.resolutions[0].value)), [
    "1024x1024",
    "1024x1536",
    "1536x1024",
  ]);
  assert.deepEqual(toPlain(getModelQualityOptions(model, "1024x1536")), [
    { value: "low", label: "低" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
  ]);
});

test("studio model selection corrects unsupported official channel parameters", () => {
  const { findModelVariant, getModelStartingPriceCents, resolveModelParameterSelection } = loadStudioModels();
  const model = buildOfficialModel();

  const selection = resolveModelParameterSelection(model, {
    aspectRatio: "9:16",
    resolution: "1080x1920",
    quality: "medium",
  });

  assert.deepEqual(toPlain(selection), {
    aspectRatio: "1:1",
    resolution: "1024x1024",
    quality: "low",
  });
  assert.equal(findModelVariant(model, "1024x1024", "medium").member_price_cents, 130);
  assert.equal(getModelStartingPriceCents(model), 20);
});

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}
