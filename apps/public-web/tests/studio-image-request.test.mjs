import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadStudioImageRequest() {
  const source = readFileSync(
    new URL("../src/features/studio/studio-image-request.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} }, Blob, File, Response };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("buildImageConversationMessages sends prior user and generated image context", () => {
  const { buildImageConversationMessages } = loadStudioImageRequest();
  const conversation = {
    id: "conv-1",
    title: "猫",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:01:00.000Z",
    turns: [{
      id: "turn-1",
      prompt: "画一只白猫",
      model: "gpt-image-2",
      mode: "generate",
      referenceImages: [],
      count: 1,
      aspectRatio: "1:1",
      resolution: "1024x1024",
      quality: "medium",
      visibility: "private",
      images: [{ id: "img-1", assetId: 101, revisedPrompt: "白猫坐在窗边" }],
      status: "success",
      createdAt: "2026-05-15T00:00:30.000Z",
    }],
  };
  const draft = {
    prompt: "把它改成夜晚",
    model: "gpt-image-2",
    mode: "chat",
    referenceImages: [],
    count: 1,
    aspectRatio: "1:1",
    resolution: "1024x1024",
    quality: "medium",
    visibility: "private",
  };

  const messages = buildImageConversationMessages({
    conversation,
    draft,
    referenceImages: [],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    { role: "user", content: "画一只白猫" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Generated image: 白猫坐在窗边" },
        { type: "image_asset", asset_id: 101 },
      ],
    },
    { role: "user", content: "把它改成夜晚" },
  ]);
});

test("buildImageJobRequest retries an existing turn with only earlier context", () => {
  const { buildImageJobRequest } = loadStudioImageRequest();
  const conversation = {
    id: "conv-1",
    title: "海报",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:03:00.000Z",
    turns: [
      {
        id: "turn-1",
        prompt: "画一个红色杯子",
        model: "gpt-image-2",
        mode: "generate",
        referenceImages: [],
        count: 1,
        aspectRatio: "1:1",
        resolution: "1024x1024",
        quality: "medium",
        visibility: "private",
        images: [{ id: "img-1", assetId: 101, revisedPrompt: "红色陶瓷杯" }],
        status: "success",
        createdAt: "2026-05-15T00:00:30.000Z",
      },
      {
        id: "turn-2",
        prompt: "把杯子放到木桌上",
        model: "gpt-image-2",
        mode: "chat",
        referenceImages: [],
        count: 1,
        aspectRatio: "1:1",
        resolution: "1024x1024",
        quality: "medium",
        visibility: "private",
        images: [{ id: "img-2", assetId: 102, revisedPrompt: "旧的木桌版本" }],
        status: "success",
        createdAt: "2026-05-15T00:01:30.000Z",
      },
      {
        id: "turn-3",
        prompt: "再加一束花",
        model: "gpt-image-2",
        mode: "chat",
        referenceImages: [],
        count: 1,
        aspectRatio: "1:1",
        resolution: "1024x1024",
        quality: "medium",
        visibility: "private",
        images: [{ id: "img-3", assetId: 103, revisedPrompt: "后续版本" }],
        status: "success",
        createdAt: "2026-05-15T00:02:30.000Z",
      },
    ],
  };
  const draft = {
    prompt: "把杯子放到木桌上",
    model: "gpt-image-2",
    mode: "chat",
    referenceImages: [],
    count: 1,
    aspectRatio: "1:1",
    resolution: "1024x1024",
    quality: "medium",
    visibility: "private",
  };

  const request = buildImageJobRequest({
    draft,
    conversation,
    referenceImages: [],
    contextBeforeTurnId: "turn-2",
  });

  assert.deepEqual(JSON.parse(JSON.stringify(request.conversation_messages)), [
    { role: "user", content: "画一个红色杯子" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Generated image: 红色陶瓷杯" },
        { type: "image_asset", asset_id: 101 },
      ],
    },
    { role: "user", content: "把杯子放到木桌上" },
  ]);
});

test("buildImageJobRequest keeps reference uploads in generate mode without source asset", () => {
  const { buildImageJobRequest } = loadStudioImageRequest();
  const draft = {
    prompt: "参考这张图生成新海报",
    model: "gpt-image-2",
    mode: "generate",
    referenceImages: [],
    count: 1,
    aspectRatio: "1:1",
    resolution: "1024x1024",
    quality: "medium",
    visibility: "private",
  };

  const request = buildImageJobRequest({
    draft,
    conversation: null,
    referenceImages: [{ name: "ref.png", assetId: 7, assetUrl: "/api/public/image/assets/7" }],
  });

  assert.equal(request.mode, "generate");
  assert.deepEqual(request.reference_asset_ids, [7]);
  assert.equal("source_asset_id" in request, false);
});

test("buildImageJobRequest forwards selected character library ids", () => {
  const { buildImageJobRequest } = loadStudioImageRequest();
  const draft = {
    prompt: "让角色在花园里读书",
    model: "gpt-image-2",
    mode: "generate",
    referenceImages: [],
    characterLibraryIds: [12],
    count: 1,
    aspectRatio: "1:1",
    resolution: "1024x1024",
    quality: "medium",
    visibility: "private",
  };

  const request = buildImageJobRequest({
    draft,
    conversation: null,
    referenceImages: [],
  });

  assert.deepEqual(request.character_library_ids, [12]);
  assert.equal(request.prompt, "让角色在花园里读书");
});

test("buildImageJobRequest opts into backend title generation for first studio turn", () => {
  const { buildImageJobRequest } = loadStudioImageRequest();
  const draft = {
    prompt: "雨夜街头的人像海报",
    model: "gpt-image-2",
    mode: "generate",
    referenceImages: [],
    count: 1,
    aspectRatio: "9:16",
    resolution: "1024x1536",
    quality: "high",
    visibility: "private",
  };

  const request = buildImageJobRequest({
    draft,
    conversation: null,
    referenceImages: [],
    autoTitle: true,
  });

  assert.equal(request.auto_title, true);
  assert.equal(request.size, "1024x1536");
  assert.equal(request.quality, "high");
});

test("uploadPendingReferenceImages uploads data url references", async () => {
  const { uploadPendingReferenceImages } = loadStudioImageRequest();
  const uploadedFiles = [];
  const fetchImage = async (url) => {
    assert.equal(url, "data:image/png;base64,AAAA");
    return new Response(new Blob(["png"], { type: "image/png" }), { status: 200 });
  };
  const uploadImageAsset = async (file) => {
    uploadedFiles.push(file);
    return {
      id: 42,
      asset_url: "/api/public/image/assets/42",
      thumbnail_url: "/api/public/image/assets/42/thumbnail",
      mime_type: file.type,
      created_at: "2026-05-15T00:00:00.000Z",
    };
  };

  const images = await uploadPendingReferenceImages(
    [{ name: "ref.png", dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" }],
    uploadImageAsset,
    fetchImage,
  );

  assert.equal(uploadedFiles[0].name, "ref.png");
  assert.equal(uploadedFiles[0].type, "image/png");
  assert.equal(images[0].assetId, 42);
  assert.equal(images[0].assetUrl, "/api/public/image/assets/42");
  assert.equal(images[0].thumbnailUrl, "/api/public/image/assets/42/thumbnail");
});
