import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const providersPageSource = readFileSync(
  new URL("../src/features/providers/providers-page.tsx", import.meta.url),
  "utf8",
);
const modelPanelsSource = readFileSync(
  new URL("../src/features/providers/model-panels.tsx", import.meta.url),
  "utf8",
);
const overviewSource = readFileSync(
  new URL("../src/features/providers/provider-overview.tsx", import.meta.url),
  "utf8",
);

function loadProviderApi(apiClient) {
  const source = readFileSync(new URL("../src/lib/admin-provider-api.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/api-client") return apiClient;
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("admin API syncs models from NewAPI catalog", async () => {
  const calls = [];
  const { adminProviderApi } = loadProviderApi({
    apiFetch: async (path, options) => {
      calls.push({ path, options });
      return [{ id: 7, code: "gpt-image-2", display_name: "GPT Image 2" }];
    },
    apiUpload: unexpectedApiUpload,
  });

  const result = await adminProviderApi.syncNewApiModels();

  assert.equal(calls[0].path, "/api/admin/models/sync-newapi");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(result[0].code, "gpt-image-2");
});

test("providers page manages NewAPI catalog without local pricing controls", () => {
  assert.match(providersPageSource, /ProviderOverview/);
  assert.match(providersPageSource, /NewAPI 接入/);
  assert.match(modelPanelsSource, /前台公开可见/);
  assert.match(overviewSource, /可见模型/);
  assert.doesNotMatch(modelPanelsSource, /formatPriceCents|VariantQuickActions|PriceInputs/);
  assert.doesNotMatch(providersPageSource, /价格矩阵|推荐价|利润率/);
});

function unexpectedApiUpload() {
  throw new Error("apiUpload should not be called");
}
