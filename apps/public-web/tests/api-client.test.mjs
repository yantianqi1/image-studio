import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadApiClient(fetchImpl, clientProviderHeaders = {}) {
  const source = readFileSync(new URL("../src/lib/api-client.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    Error,
    Headers,
    Response,
    exports: {},
    fetch: fetchImpl,
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/client-provider-config") {
        return { getClientProviderRequestHeaders: () => clientProviderHeaders };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;

  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("apiFetch returns the data field from successful API envelopes", async () => {
  const models = [{ code: "local-dev-image" }];
  const { apiFetch } = loadApiClient(async () =>
    Response.json({ data: models, meta: {}, error: null }),
  );

  await assert.deepEqual(await apiFetch("/models"), models);
});

test("apiFetch includes saved client provider headers", async () => {
  const captured = {};
  const { apiFetch } = loadApiClient(async (_, init) => {
    captured.headers = init.headers;
    return Response.json({ data: [], meta: {}, error: null });
  }, {
    "x-client-id": "browser-1",
    "x-client-provider-base-url": "https://client.example/v1",
    "x-client-provider-api-key": "sk-client",
  });

  await apiFetch("/models");

  assert.equal(captured.headers.get("x-client-id"), "browser-1");
  assert.equal(captured.headers.get("x-client-provider-base-url"), "https://client.example/v1");
  assert.equal(captured.headers.get("x-client-provider-api-key"), "sk-client");
});
