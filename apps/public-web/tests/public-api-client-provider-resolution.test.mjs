import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPublicApi(apiFetchImpl, rememberImpl) {
  const source = readFileSync(new URL("../src/lib/public-api.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    Event,
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/api-client") {
        return { apiDownload: () => undefined, apiFetch: apiFetchImpl, apiUpload: () => undefined };
      }
      if (path === "@/lib/client-provider-config") {
        return { rememberResolvedClientProviderBaseUrl: rememberImpl };
      }
      if (path === "@/lib/public-api.types") {
        return {};
      }
      throw new Error(`Unexpected require: ${path}`);
    },
    window: { dispatchEvent: () => undefined },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports.publicApi;
}

test("public image job polling remembers resolved client provider base url", async () => {
  const remembered = [];
  const publicApi = loadPublicApi(
    async () => ({
      id: 12,
      status: "succeeded",
      client_provider_base_url: "https://good.example/v1",
    }),
    (baseUrl) => remembered.push(baseUrl),
  );

  await publicApi.getImageJob(12);

  assert.deepEqual(remembered, ["https://good.example/v1"]);
});
