import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPromptCrafterApi() {
  const source = readFileSync(
    new URL("../src/features/prompt-crafter/prompt-crafter-api.ts", import.meta.url),
    "utf8",
  );
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
    TextDecoder,
    exports: {},
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/client-provider-config") {
        return { getClientProviderRequestHeaders: () => ({ "x-client-id": "browser-1" }) };
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("buildPromptCrafterStreamPayload preserves chat messages", () => {
  const { buildPromptCrafterStreamPayload } = loadPromptCrafterApi();

  assert.equal(
    JSON.stringify(buildPromptCrafterStreamPayload([{ role: "user", content: "咖啡包装" }])),
    JSON.stringify({ messages: [{ role: "user", content: "咖啡包装" }] }),
  );
});

test("readPromptCrafterTextStream emits decoded chunks", async () => {
  const { readPromptCrafterTextStream } = loadPromptCrafterApi();
  const chunks = [];

  await readPromptCrafterTextStream(new Response("最终提示词：\n生成一张海报。"), (chunk) => {
    chunks.push(chunk);
  });

  assert.equal(chunks.join(""), "最终提示词：\n生成一张海报。");
});
