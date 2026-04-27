import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/use-api-resource.ts", import.meta.url),
  "utf8",
);

function loadUseApiResource() {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require(moduleName) {
      if (moduleName === "react") {
        return { useEffect() {}, useEffectEvent: (loader) => loader, useState: () => [] };
      }
      if (moduleName === "@/lib/api-client") {
        return { ApiError: class ApiError extends Error {} };
      }
      throw new Error(`Unexpected module: ${moduleName}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("useApiResource does not restart the loader after every render", () => {
  const effectCall = source.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[(.*?)\]\);/);
  assert.ok(effectCall, "Expected useApiResource to declare a useEffect dependency array");

  const dependencies = effectCall[1]
    .split(",")
    .map((dependency) => dependency.trim())
    .filter(Boolean);

  assert.deepEqual(dependencies, ["refreshKey"]);
});

test("startResourceRefresh keeps ready data visible during a refresh", () => {
  const { startResourceRefresh } = loadUseApiResource();
  const readyState = { status: "ready", data: [{ id: "shot_1" }] };

  assert.equal(startResourceRefresh(readyState), readyState);
  assert.equal(startResourceRefresh({ status: "loading" }).status, "loading");
  assert.equal(startResourceRefresh({ status: "error", message: "network" }).status, "loading");
});
