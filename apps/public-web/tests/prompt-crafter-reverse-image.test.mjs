import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const apiSource = readFileSync(
  new URL("../src/features/prompt-crafter/prompt-crafter-api.ts", import.meta.url),
  "utf8",
);

const appSource = readFileSync(
  new URL("../src/features/prompt-crafter/prompt-crafter-app.tsx", import.meta.url),
  "utf8",
);

function loadPromptCrafterApi(fetchImpl) {
  const compiled = ts.transpileModule(apiSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    AbortController,
    Error,
    Headers,
    TextDecoder,
    console,
    exports: {},
    fetch: fetchImpl,
    module: { exports: {} },
    require: (path) => {
      if (path === "@/lib/client-provider-config") {
        throw new Error("prompt crafter API must not read client provider headers");
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("prompt crafter reverse image API streams from the image endpoint", async () => {
  const calls = [];
  const chunks = [];
  const { streamPromptCrafterReverseImage } = loadPromptCrafterApi(async (url, options) => {
    calls.push({ url, options });
    return new Response(
      'event: chunk\ndata: {"content":"反推提示词"}\n\nevent: done\ndata: {}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  });

  await streamPromptCrafterReverseImage({
    assetIds: [7, 8],
    note: "保留产品文字",
    onChunk: (chunk) => chunks.push(chunk),
  });

  assert.equal(calls[0].url, "/api/public/prompt-crafter/reverse-image/stream");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.get("x-client-provider-api-key"), null);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    asset_ids: [7, 8],
    note: "保留产品文字",
  });
  assert.deepEqual(chunks, ["反推提示词"]);
});

test("prompt crafter page exposes upload and folder reverse controls", () => {
  assert.match(appSource, /streamPromptCrafterReverseImage/);
  assert.match(appSource, /publicApi\.uploadImageAsset/);
  assert.match(appSource, /handleReverseImageFiles/);
  assert.match(appSource, /multiple/);
  assert.match(appSource, /webkitdirectory/);
  assert.match(appSource, /accept="image\/\*"/);
});
