import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const navSource = readFileSync(new URL("../src/features/shell/admin-nav.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(
  new URL("../src/app/admin/(protected)/character-library/page.tsx", import.meta.url),
  "utf8",
);
const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

function loadAdminApi(apiClient) {
  const source = readFileSync(new URL("../src/lib/admin-api.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    FormData,
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/api-client") return apiClient;
      if (path === "@/lib/admin-image-job-types") return {};
      if (path === "@/lib/admin-users") return { buildUsersSearch: () => "" };
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("admin API lists character library", async () => {
  const calls = [];
  const { adminApi } = loadAdminApi({
    apiFetch: async (path) => {
      calls.push(path);
      return [{ id: 1, name: "公共形象" }];
    },
    apiUpload: unexpectedApiUpload,
  });

  const items = await adminApi.characterLibrary();

  assert.deepEqual(calls, ["/api/admin/character-library"]);
  assert.equal(items[0].name, "公共形象");
});

test("admin API uploads public character as multipart", async () => {
  const calls = [];
  const file = new File(["png"], "role.png", { type: "image/png" });
  const { adminApi } = loadAdminApi({
    apiFetch: unexpectedApiFetch,
    apiUpload: async (path, body) => {
      calls.push({ path, body });
      return { id: 2, name: "公共形象" };
    },
  });

  const item = await adminApi.createCharacterLibraryItem({ name: "公共形象", file });

  assert.equal(calls[0].path, "/api/admin/character-library");
  assert.equal(calls[0].body.get("name"), "公共形象");
  assert.equal(calls[0].body.get("file"), file);
  assert.equal(item.id, 2);
});

test("admin character library page is routed from the navigation", () => {
  assert.match(routeSource, /AdminCharacterLibraryPage/);
  assert.match(navSource, /href: "\/admin\/character-library"/);
  assert.match(navSource, /label: "形象库"/);
});

test("admin Next proxy allows image uploads larger than the default body limit", () => {
  assert.match(nextConfigSource, /const API_PROXY_BODY_LIMIT = "50mb"/);
  assert.match(nextConfigSource, /proxyClientMaxBodySize:\s*API_PROXY_BODY_LIMIT/);
});

function unexpectedApiFetch() {
  throw new Error("apiFetch should not be called");
}

function unexpectedApiUpload() {
  throw new Error("apiUpload should not be called");
}
