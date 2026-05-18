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
    Blob,
    FormData,
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

test("publicApi downloads comic character reference packs from task endpoint", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: unexpectedApiFetch,
    apiUpload: unexpectedApiUpload,
    apiDownload: async (path) => {
      calls.push(path);
      return new Blob(["zip"]);
    },
  });

  await publicApi.downloadComicCharacterReferencePack("task-1");

  assert.deepEqual(calls, ["/comic/tasks/task-1/character-references/export"]);
});

test("publicApi imports comic character reference packs as multipart zip", async () => {
  const calls = [];
  const file = new Blob(["zip"], { type: "application/zip" });
  const { publicApi } = loadPublicApi({
    apiFetch: unexpectedApiFetch,
    apiDownload: unexpectedApiDownload,
    apiUpload: async (path, formData) => {
      calls.push({ path, file: formData.get("file") });
      return { imported_count: 1, ready: true };
    },
  });

  await publicApi.importComicCharacterReferencePack("task-1", file);

  assert.equal(calls[0].path, "/comic/tasks/task-1/character-references/import");
  assert.equal(calls[0].file.type, "application/zip");
  assert.equal(await calls[0].file.text(), "zip");
});

test("publicApi reads public quota status from quota endpoint", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: async (path) => {
      calls.push(path);
      return { mode: "daily_global", limit_count: 20, used_count: 4, remaining_count: 16, exhausted: false };
    },
    apiUpload: unexpectedApiUpload,
    apiDownload: unexpectedApiDownload,
  });

  const status = await publicApi.getPublicQuotaStatus();

  assert.deepEqual(calls, ["/quota"]);
  assert.equal(status.remaining_count, 16);
});

test("publicApi creates comic tasks with client provider headers enabled", async () => {
  const calls = [];
  const { publicApi } = loadPublicApi({
    apiFetch: async (path, options) => {
      calls.push({ path, includeClientProviderHeaders: options.includeClientProviderHeaders, body: options.body });
      return { id: "task-1" };
    },
    apiUpload: unexpectedApiUpload,
    apiDownload: unexpectedApiDownload,
  });

  await publicApi.createComicTask({
    title: "Comic",
    sourceText: "Source",
    stylePrompt: "Style",
  });

  assert.equal(calls[0].path, "/comic/tasks");
  assert.equal(calls[0].includeClientProviderHeaders, true);
  assert.equal(calls[0].body.title, "Comic");
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
