import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadComicUtils() {
  const source = readFileSync(new URL("../src/features/comic/comic-utils.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("empty comic tasks do not create fake storyboard shots", () => {
  const { buildStoryboardShots } = loadComicUtils();

  assert.equal(buildStoryboardShots([]).length, 0);
});

test("comic tasks without completed storyboard output do not create fake shots", () => {
  const { buildStoryboardShots } = loadComicUtils();
  const shots = buildStoryboardShots([
    { id: "task_1", status: "queued", task_type: "storyboard-generate" },
    { id: "task_2", status: "completed", output_payload: {} },
  ]);

  assert.equal(shots.length, 0);
});

test("completed comic task maps explicit storyboard output", () => {
  const { buildStoryboardShots } = loadComicUtils();
  const shots = buildStoryboardShots([
    {
      id: "task_1",
      status: "completed",
      output_payload: {
        storyboard: [
          {
            id: "panel_1",
            title: "开场",
            description: "主角进入雨夜街道",
            shotType: "远景",
            scene: "场景 1",
            duration: "3s",
          },
        ],
      },
    },
  ], [
    {
      id: 7,
      image_index: 1,
      image_job_id: 11,
      prompt: "Task: Generate one finished comic page.",
      result: { asset_url: "/api/public/image/assets/7" },
      image_status: "succeeded",
    },
  ]);

  assert.equal(shots.length, 1);
  assert.equal(shots[0].id, "task_1-panel_1");
  assert.equal(shots[0].description, "主角进入雨夜街道");
  assert.equal(shots[0].promptText, "Task: Generate one finished comic page.");
  assert.equal(shots[0].assetUrl, "/api/public/image/assets/7");
});

test("comic image results are matched by image_index instead of response order", () => {
  const { buildStoryboardShots } = loadComicUtils();
  const shots = buildStoryboardShots([
    {
      id: "task_order",
      status: "completed",
      output_payload: {
        storyboard: [
          {
            id: "page_1",
            title: "第一页",
            description: "开场",
            shotType: "第 1 页",
            scene: "场景 1",
            duration: "Job 1",
          },
          {
            id: "page_2",
            title: "第二页",
            description: "转折",
            shotType: "第 2 页",
            scene: "场景 2",
            duration: "Job 2",
          },
        ],
      },
    },
  ], [
    {
      id: 8,
      image_index: 2,
      image_job_id: 22,
      prompt: "page two prompt",
      image_status: "succeeded",
      result: { asset_url: "/api/public/image/assets/8" },
    },
    {
      id: 7,
      image_index: 1,
      image_job_id: 11,
      prompt: "page one prompt",
      image_status: "succeeded",
      result: { asset_url: "/api/public/image/assets/7" },
    },
  ]);

  assert.equal(shots[0].assetUrl, "/api/public/image/assets/7");
  assert.equal(shots[0].imageJobId, 11);
  assert.equal(shots[1].assetUrl, "/api/public/image/assets/8");
  assert.equal(shots[1].imageJobId, 22);
});
