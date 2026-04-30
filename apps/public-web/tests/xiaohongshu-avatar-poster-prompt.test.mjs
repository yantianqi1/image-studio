import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const promptModuleMap = new Map([
  ["./city-poster-prompt", "../src/features/prompt-apps/city-poster-prompt.ts"],
  ["./korean-idol-contact-sheet-prompt", "../src/features/prompt-apps/korean-idol-contact-sheet-prompt.ts"],
  ["./song-poem-scene-prompt", "../src/features/prompt-apps/song-poem-scene-prompt.ts"],
  ["./xiaohongshu-avatar-poster-prompt", "../src/features/prompt-apps/xiaohongshu-avatar-poster-prompt.ts"],
]);

function loadPromptApps() {
  return loadTsModule("../src/features/prompt-apps/prompt-apps.ts", promptModuleMap);
}

function loadTsModule(path, requireMap = new Map()) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require: (path) => {
      const modulePath = requireMap.get(path);
      if (modulePath) {
        return loadTsModule(modulePath, requireMap);
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("prompt app catalog exposes xiaohongshu avatar poster app", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "xiaohongshu-avatar-poster");

  assert.equal(app.title, "小红书头像出逃海报");
  assert.equal(app.href, "/apps/xiaohongshu-avatar-poster");
  assert.equal(app.cover.badge, "小红书");
  assert.equal(app.cover.label, "头像出逃海报");
  assert.equal(app.cover.imageSrc, "/app-covers/xiaohongshu-avatar-poster.png");
  assert.equal(app.cover.aspectRatio, "3:4");
  assert.equal(app.statusLabel, "内置提示词");
});

test("xiaohongshu avatar poster app cover asset uses the provided preview PNG", () => {
  const coverDimensions = readPngDimensions("apps/public-web/public/app-covers/xiaohongshu-avatar-poster.png");
  const sourceDimensions = readPngDimensions("app_image/小红书.png");

  assert.deepEqual(coverDimensions, sourceDimensions);
});

test("buildXiaohongshuAvatarPosterPrompt inserts full body character note", () => {
  const { buildXiaohongshuAvatarPosterPrompt } = loadPromptApps();
  const prompt = buildXiaohongshuAvatarPosterPrompt({
    characterNote: "黑色短发、红色夹克、右手拿小红书标志贴纸",
  });

  assert.match(prompt, /【参考图】= 使用上传的小红书个人主页截图/);
  assert.match(prompt, /【全身卡通人物】= \{黑色短发、红色夹克、右手拿小红书标志贴纸\}/);
  assert.match(prompt, /真实手机UI/);
  assert.match(prompt, /黑白漫画线稿/);
  assert.match(prompt, /右半边身体逐渐碎裂/);
});

test("buildXiaohongshuAvatarPosterPrompt defaults character note to avatar style", () => {
  const { buildXiaohongshuAvatarPosterPrompt } = loadPromptApps();
  const prompt = buildXiaohongshuAvatarPosterPrompt({ characterNote: "   " });

  assert.match(prompt.split("\n")[2], /【全身卡通人物】= \{延续头像里的风格\}/);
});

function readPngDimensions(path) {
  const header = readFileSync(path).subarray(0, 24);
  assert.equal(header.toString("ascii", 1, 4), "PNG");
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}
