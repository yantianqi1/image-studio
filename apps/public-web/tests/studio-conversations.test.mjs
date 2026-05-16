import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadStudioConversations() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-conversations.ts", import.meta.url),
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
      if (id === "localforage") {
        return {
          default: {
            createInstance: () => ({ getItem: async () => null, setItem: async () => undefined }),
          },
        };
      }
      if (id === "@/lib/client-id") {
        return { createClientId: (prefix) => `${prefix}-test-id` };
      }
      throw new Error(`unexpected import: ${id}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

function createConversation() {
  return {
    id: "conv-1",
    title: "测试对话",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:01:00.000Z",
    turns: [
      {
        id: "turn-1",
        prompt: "第一条",
        model: "gpt-image-2",
        mode: "generate",
        referenceImages: [],
        count: 1,
        aspectRatio: "1:1",
        resolution: "1024x1024",
        quality: "medium",
        visibility: "private",
        images: [],
        status: "success",
        createdAt: "2026-05-15T00:00:30.000Z",
      },
      {
        id: "turn-2",
        prompt: "失败这条",
        model: "gpt-image-2",
        mode: "chat",
        referenceImages: [{ name: "ref.png", assetId: 9 }],
        count: 1,
        aspectRatio: "1:1",
        resolution: "1024x1024",
        quality: "medium",
        visibility: "private",
        images: [{ id: "img-2", assetId: 102 }],
        status: "error",
        error: "provider failed",
        taskId: 77,
        taskStatus: "failed",
        createdAt: "2026-05-15T00:01:30.000Z",
      },
    ],
  };
}

test("retryTurnInConversation reuses the failed turn instead of appending a new one", () => {
  const { retryTurnInConversation } = loadStudioConversations();
  const retriedAt = "2026-05-15T00:02:00.000Z";

  const updated = retryTurnInConversation(createConversation(), "turn-2", retriedAt);

  assert.equal(updated.turns.length, 2);
  assert.equal(updated.turns[1].id, "turn-2");
  assert.equal(updated.turns[1].prompt, "失败这条");
  assert.equal(updated.turns[1].status, "queued");
  assert.deepEqual(JSON.parse(JSON.stringify(updated.turns[1].images)), []);
  assert.equal(updated.turns[1].error, undefined);
  assert.equal(updated.turns[1].taskId, null);
  assert.equal(updated.turns[1].taskStatus, null);
  assert.equal(updated.turns[1].createdAt, retriedAt);
  assert.equal(updated.updatedAt, retriedAt);
});

test("retryTurnWithPromptInConversation edits the prompt and reuses the same turn", () => {
  const { retryTurnWithPromptInConversation } = loadStudioConversations();
  const retriedAt = "2026-05-15T00:04:00.000Z";

  const updated = retryTurnWithPromptInConversation(createConversation(), "turn-2", "改成夜景霓虹", retriedAt);

  assert.equal(updated.turns.length, 2);
  assert.equal(updated.turns[1].id, "turn-2");
  assert.equal(updated.turns[1].prompt, "改成夜景霓虹");
  assert.equal(updated.turns[1].status, "queued");
  assert.deepEqual(JSON.parse(JSON.stringify(updated.turns[1].images)), []);
  assert.equal(updated.turns[1].error, undefined);
  assert.equal(updated.turns[1].createdAt, retriedAt);
  assert.equal(updated.updatedAt, retriedAt);
});

test("removeTurnFromConversation deletes one historical turn from the conversation", () => {
  const { removeTurnFromConversation } = loadStudioConversations();
  const deletedAt = "2026-05-15T00:03:00.000Z";

  const updated = removeTurnFromConversation(createConversation(), "turn-1", deletedAt);

  assert.deepEqual(JSON.parse(JSON.stringify(updated.turns.map((turn) => turn.id))), ["turn-2"]);
  assert.equal(updated.updatedAt, deletedAt);
});
