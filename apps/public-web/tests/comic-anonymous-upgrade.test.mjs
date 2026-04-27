import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const HELPER_PATH = "apps/public-web/src/features/comic/comic-anonymous-session.ts";
const PUBLIC_API_SOURCE = readFileSync("apps/public-web/src/lib/public-api.ts", "utf8");
const COMIC_STUDIO_SOURCE = readFileSync("apps/public-web/src/features/comic/comic-studio.tsx", "utf8");
const LOGIN_PANEL_SOURCE = readFileSync("apps/public-web/src/features/auth/login-panel.tsx", "utf8");

function loadComicAnonymousSession(publicApi, isUnauthorizedApiError) {
  const source = readFileSync(HELPER_PATH, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const listeners = new Map();
  const windowObject = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    dispatchEvent: (event) => {
      listeners.get(event.type)?.(event);
      return true;
    },
  };
  const sandbox = {
    Event,
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/public-api") return { publicApi };
      if (path === "@/lib/api-client") return { isUnauthorizedApiError };
      throw new Error(`Unexpected require: ${path}`);
    },
    window: windowObject,
  };
  sandbox.exports = sandbox.module.exports;

  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("ensureComicAnonymousSession only creates anonymous owner when no login owner exists", async () => {
  const calls = [];
  const helper = loadComicAnonymousSession({
    getCurrentUser: async () => ({ id: 1 }),
    ensureAnonymousSession: async () => calls.push("anonymous"),
  }, () => false);

  await helper.ensureComicAnonymousSession();

  assert.deepEqual(calls, []);
});

test("ensureComicAnonymousSession creates anonymous owner after auth 401", async () => {
  const calls = [];
  const unauthorizedError = new Error("authentication required");
  const helper = loadComicAnonymousSession({
    getCurrentUser: async () => {
      throw unauthorizedError;
    },
    ensureAnonymousSession: async () => calls.push("anonymous"),
  }, (error) => error === unauthorizedError);

  await helper.ensureComicAnonymousSession();

  assert.deepEqual(calls, ["anonymous"]);
});

test("comic anonymous session helper exposes an owner changed browser event", () => {
  const events = [];
  const helper = loadComicAnonymousSession({
    getCurrentUser: async () => ({ id: 1 }),
    ensureAnonymousSession: async () => undefined,
  }, () => false);

  const dispose = helper.listenComicOwnerChanged(() => events.push("changed"));
  helper.notifyComicOwnerChanged();
  dispose();
  helper.notifyComicOwnerChanged();

  assert.deepEqual(events, ["changed"]);
});

test("public API exposes anonymous session and current user endpoints", () => {
  assert.match(PUBLIC_API_SOURCE, /ensureAnonymousSession\(\)/);
  assert.match(PUBLIC_API_SOURCE, /apiFetch<AnonymousSessionResponse>\("\/auth\/anonymous-session"/);
  assert.match(PUBLIC_API_SOURCE, /method:\s*"POST"/);
  assert.match(PUBLIC_API_SOURCE, /getCurrentUser\(\)/);
  assert.match(PUBLIC_API_SOURCE, /apiFetch<LoginResponse>\("\/auth\/me"\)/);
});

test("comic studio gates owner scoped data behind anonymous session initialization", () => {
  assert.match(COMIC_STUDIO_SOURCE, /ensureComicAnonymousSession/);
  assert.match(COMIC_STUDIO_SOURCE, /listenComicOwnerChanged/);
  assert.match(COMIC_STUDIO_SOURCE, /resolveOwnerScopedState/);
  assert.match(COMIC_STUDIO_SOURCE, /setOwnerRefreshKey/);
});

test("login success notifies owner-scoped comic data to refresh", () => {
  assert.match(LOGIN_PANEL_SOURCE, /notifyComicOwnerChanged/);
  assert.match(LOGIN_PANEL_SOURCE, /notifyComicOwnerChanged\(\)/);
});
