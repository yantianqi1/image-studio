import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadComplianceRetry() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-compliance-retry.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require: (id) => {
      if (id === "@/features/studio/studio-prompt-actions") {
        return { buildPromptComplianceInstruction: (prompt) => `COMPLIANCE:${prompt}` };
      }
      throw new Error(`unexpected import: ${id}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("rewritePromptForCompliance streams the configured compliance instruction", async () => {
  const { rewritePromptForCompliance } = loadComplianceRetry();
  const calls = [];

  const rewritten = await rewritePromptForCompliance({
    prompt: " 少女写真 ",
    streamPrompt: async (options) => {
      calls.push(options);
      options.onChunk("成年女性");
      options.onChunk("时尚写真");
    },
  });

  assert.equal(rewritten, "成年女性时尚写真");
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].messages)), [
    { role: "user", content: "COMPLIANCE:少女写真" },
  ]);
});

test("rewritePromptForCompliance rejects empty llm output instead of falling back", async () => {
  const { rewritePromptForCompliance } = loadComplianceRetry();

  await assert.rejects(
    () => rewritePromptForCompliance({ prompt: "原提示词", streamPrompt: async () => undefined }),
    /合规化提示词结果为空/,
  );
});
