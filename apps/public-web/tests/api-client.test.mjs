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

test("apiFetch omits saved client provider headers by default", async () => {
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

  assert.equal(captured.headers.get("x-client-id"), null);
  assert.equal(captured.headers.get("x-client-provider-base-url"), null);
  assert.equal(captured.headers.get("x-client-provider-api-key"), null);
});

test("apiFetch includes saved client provider headers only when requested", async () => {
  const captured = {};
  const { apiFetch } = loadApiClient(async (_, init) => {
    captured.headers = init.headers;
    return Response.json({ data: [], meta: {}, error: null });
  }, {
    "x-client-id": "browser-1",
    "x-client-provider-base-url": "https://client.example/v1",
    "x-client-provider-api-key": "sk-client",
  });

  await apiFetch("/image/jobs", { method: "POST", body: {}, includeClientProviderHeaders: true });

  assert.equal(captured.headers.get("x-client-id"), "browser-1");
  assert.equal(captured.headers.get("x-client-provider-base-url"), "https://client.example/v1");
  assert.equal(captured.headers.get("x-client-provider-api-key"), "sk-client");
});

test("isUnauthorizedApiError detects API 401 responses", async () => {
  const { apiFetch, isUnauthorizedApiError } = loadApiClient(async () =>
    Response.json(
      { data: null, meta: {}, error: { code: "unauthorized", message: "authentication required" } },
      { status: 401 },
    ),
  );

  await assert.rejects(
    () => apiFetch("/billing/wallets/me"),
    (error) => isUnauthorizedApiError(error),
  );
});

test("apiFetch preserves API envelope error codes on ApiError", async () => {
  const { apiFetch } = loadApiClient(async () =>
    Response.json(
      {
        data: null,
        meta: {},
        error: {
          code: "anonymous_image_job_concurrency_limit",
          message: "匿名生图任务最多 2 个同时处理中",
        },
      },
      { status: 429 },
    ),
  );

  await assert.rejects(
    () => apiFetch("/image/jobs", { method: "POST", body: {} }),
    (error) => error.code === "anonymous_image_job_concurrency_limit",
  );
});

test("apiDownload returns binary responses without client provider headers by default", async () => {
  const captured = {};
  const { apiDownload } = loadApiClient(async (endpoint, init) => {
    captured.endpoint = endpoint;
    captured.headers = init.headers;
    return new Response("zip-bytes", { status: 200, headers: { "content-type": "application/zip" } });
  }, {
    "x-client-id": "browser-1",
  });

  const blob = await apiDownload("/comic/tasks/task-1/character-references/export");

  assert.equal(captured.endpoint, "/api/public/comic/tasks/task-1/character-references/export");
  assert.equal(captured.headers.get("x-client-id"), null);
  assert.equal(await blob.text(), "zip-bytes");
});
