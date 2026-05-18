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
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/api-client") {
        return apiClient;
      }
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

test("publicApi reads image gallery by scope", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: async (path) => {
      calls.push(path);
      return [{ asset_id: 12 }];
    },
    apiUpload: unexpectedApiUpload,
    apiDownload: unexpectedApiDownload,
  });

  const items = await publicApi.getImageGallery("mine");

  assert.deepEqual(calls, ["/image/gallery?scope=mine"]);
  assert.equal(items[0].asset_id, 12);
});

test("publicApi updates image asset visibility", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: async (path, options) => {
      calls.push({ path, body: options.body, method: options.method });
      return { asset_id: 12, visibility: "public" };
    },
    apiUpload: unexpectedApiUpload,
    apiDownload: unexpectedApiDownload,
  });

  await publicApi.updateImageAssetVisibility(12, "public");

  assert.equal(calls[0].path, "/image/assets/12/visibility");
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[0].body.visibility, "public");
});

test("publicApi sends image job visibility", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: async (path, options) => {
      calls.push({ path, body: options.body });
      return { id: 1, status: "queued" };
    },
    apiUpload: unexpectedApiUpload,
    apiDownload: unexpectedApiDownload,
  });

  await publicApi.generateImage({ prompt: "城市生活", model_code: "gpt-image-2", requested_count: 1, visibility: "public" });

  assert.equal(calls[0].path, "/image/jobs");
  assert.equal(calls[0].body.visibility, "public");
});

test("publicApi logs out through auth logout endpoint", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: async (path, options) => {
      calls.push({ path, method: options?.method ?? "GET" });
      return { logged_out: true };
    },
    apiUpload: unexpectedApiUpload,
    apiDownload: unexpectedApiDownload,
  });

  await publicApi.logout();

  assert.deepEqual(calls, [{ path: "/auth/logout", method: "POST" }]);
});

function unexpectedApiUpload() {
  throw new Error("apiUpload should not be called");
}

function unexpectedApiDownload() {
  throw new Error("apiDownload should not be called");
}
