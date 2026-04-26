import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadApiClient(fetchImpl) {
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
