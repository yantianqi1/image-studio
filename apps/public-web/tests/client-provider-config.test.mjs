import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function loadClientProviderConfig(storage = createStorage()) {
  const source = readFileSync(new URL("../src/lib/client-provider-config.ts", import.meta.url), "utf8");
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
      if (path === "@/lib/client-id") {
        return { createClientId: (prefix) => `${prefix}-fixed` };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
    window: { localStorage: storage },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("client provider headers allow key-only requests and omit empty base url", () => {
  const { getClientProviderRequestHeaders, saveClientProviderDraft } = loadClientProviderConfig();

  saveClientProviderDraft({ baseUrl: "", apiKey: "sk-client" });
  const headers = getClientProviderRequestHeaders();

  assert.equal(headers["x-client-id"], "cs-client-fixed");
  assert.equal(headers["x-client-provider-api-key"], "sk-client");
  assert.equal("x-client-provider-base-url" in headers, false);
});

test("resolved client provider base url is remembered for the current key", () => {
  const {
    getClientProviderRequestHeaders,
    readStoredClientProviderConfig,
    rememberResolvedClientProviderBaseUrl,
    saveClientProviderDraft,
  } = loadClientProviderConfig();

  saveClientProviderDraft({ baseUrl: "", apiKey: "sk-client" });
  rememberResolvedClientProviderBaseUrl("https://good.example/v1");

  assert.equal(readStoredClientProviderConfig().baseUrl, "https://good.example/v1");
  assert.equal(
    getClientProviderRequestHeaders()["x-client-provider-base-url"],
    "https://good.example/v1",
  );
});

test("remembered client provider base url is not carried to a different key", () => {
  const { getClientProviderRequestHeaders, rememberResolvedClientProviderBaseUrl, saveClientProviderDraft } =
    loadClientProviderConfig();

  saveClientProviderDraft({ baseUrl: "", apiKey: "sk-first" });
  rememberResolvedClientProviderBaseUrl("https://first.example/v1");
  saveClientProviderDraft({ baseUrl: "https://first.example/v1", apiKey: "sk-second" });

  const headers = getClientProviderRequestHeaders();

  assert.equal(headers["x-client-provider-api-key"], "sk-second");
  assert.equal("x-client-provider-base-url" in headers, false);
});
