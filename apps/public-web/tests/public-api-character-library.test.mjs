import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPublicApi(apiClient) {
  const source = readFileSync(new URL("../src/lib/public-api.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    Event,
    FormData,
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/api-client") return apiClient;
      if (path === "@/lib/client-provider-config") {
        return { rememberResolvedClientProviderBaseUrl: () => undefined };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("publicApi reads character library", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: async (path) => {
      calls.push(path);
      return [{ id: 7, name: "公共形象" }];
    },
    apiUpload: unexpectedApiUpload,
    apiDownload: unexpectedApiDownload,
  });

  const items = await publicApi.getCharacterLibrary();

  assert.deepEqual(calls, ["/character-library"]);
  assert.equal(items[0].name, "公共形象");
});

test("publicApi uploads private character with a name", async () => {
  const calls = [];
  const file = new File(["png"], "role.png", { type: "image/png" });
  const { publicApi } = loadPublicApi({
    apiFetch: unexpectedApiFetch,
    apiUpload: async (path, body) => {
      calls.push({ path, body });
      return { id: 8, name: "我的形象" };
    },
    apiDownload: unexpectedApiDownload,
  });

  const item = await publicApi.createCharacterLibraryItem({ name: "我的形象", file });

  assert.equal(calls[0].path, "/character-library");
  assert.equal(calls[0].body.get("name"), "我的形象");
  assert.equal(calls[0].body.get("file"), file);
  assert.equal(item.id, 8);
});

function unexpectedApiFetch() {
  throw new Error("apiFetch should not be called");
}

function unexpectedApiUpload() {
  throw new Error("apiUpload should not be called");
}

function unexpectedApiDownload() {
  throw new Error("apiDownload should not be called");
}
