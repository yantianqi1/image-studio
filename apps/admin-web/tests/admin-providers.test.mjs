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
const quickActionsSource = readFileSync(
  new URL("../src/features/providers/variant-quick-actions.tsx", import.meta.url),
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

test("admin API applies default variant pricing", async () => {
  const calls = [];
  const { adminProviderApi } = loadProviderApi({
    apiFetch: async (path, options) => {
      calls.push({ path, options });
      return { updated: 84, skipped: 0, total: 84, variants: [] };
    },
    apiUpload: unexpectedApiUpload,
  });

  const result = await adminProviderApi.applyDefaultPricing(7, { force: true, profit_margin_basis_points: 3000 });

  assert.equal(calls[0].path, "/api/admin/models/7/variants/apply-default-pricing");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(JSON.parse(calls[0].options.body).force, true);
  assert.equal(JSON.parse(calls[0].options.body).profit_margin_basis_points, 3000);
  assert.equal(result.updated, 84);
});

test("providers page exposes model pricing overview and quick actions", () => {
  assert.match(providersPageSource, /ProviderOverview/);
  assert.match(overviewSource, /基础价范围/);
  assert.match(modelPanelsSource, /formatPriceCents/);
  assert.match(modelPanelsSource, /VariantQuickActions/);
  assert.match(quickActionsSource, /应用推荐价/);
  assert.match(quickActionsSource, /强制重算/);
  assert.match(quickActionsSource, /默认利润率 30%/);
});

function unexpectedApiUpload() {
  throw new Error("apiUpload should not be called");
}
