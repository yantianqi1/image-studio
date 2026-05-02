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

test("readPromptCrafterEventStream emits decoded SSE chunks as they arrive", async () => {
  const { readPromptCrafterEventStream } = loadPromptCrafterApi();
  const chunks = [];
  let controller;
  const stream = new ReadableStream({
    start(nextController) {
      controller = nextController;
      controller.enqueue(new TextEncoder().encode('event: chunk\ndata: {"content":"第一段"}\n\n'));
    },
  });

  const reading = readPromptCrafterEventStream(new Response(stream), (chunk) => {
    chunks.push(chunk);
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(chunks, ["第一段"]);
  controller.enqueue(new TextEncoder().encode('event: chunk\ndata: {"content":"第二段"}\n\n'));
  controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
  controller.close();
  await reading;
  assert.deepEqual(chunks, ["第一段", "第二段"]);
});

test("parsePromptCrafterSseBlock surfaces stream error events", () => {
  const { parsePromptCrafterSseBlock } = loadPromptCrafterApi();

  assert.throws(
    () => parsePromptCrafterSseBlock('event: error\ndata: {"code":"provider_request_failed","message":"provider down"}'),
    /provider down/,
  );
});
