import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/features/prompt-apps/xiaohongshu-avatar-poster-app.tsx", import.meta.url),
  "utf8",
);

const pageSource = readFileSync(
  new URL("../src/app/apps/xiaohongshu-avatar-poster/page.tsx", import.meta.url),
  "utf8",
);

const formSource = readFileSync(
  new URL("../src/features/prompt-apps/xiaohongshu-avatar-poster-form.tsx", import.meta.url),
  "utf8",
);

const uploadSource = readFileSync(
  new URL("../src/features/prompt-apps/xiaohongshu-avatar-poster-upload.tsx", import.meta.url),
  "utf8",
);

const promptSource = readFileSync(
  new URL("../src/features/prompt-apps/xiaohongshu-avatar-poster-prompt.ts", import.meta.url),
  "utf8",
);

test("xiaohongshu avatar poster route renders the app component", () => {
  assert.match(pageSource, /import \{ XiaohongshuAvatarPosterApp \}/);
  assert.match(pageSource, /return <XiaohongshuAvatarPosterApp \/>/);
});

test("xiaohongshu avatar poster page exposes required upload and app center back link", () => {
  assert.match(appSource, /headerTitle="小红书头像出逃海报"/);
  assert.match(appSource, /aria-label="返回应用中心"/);
  assert.match(appSource, /href="\/apps"/);
  assert.match(uploadSource, /主页截图/);
  assert.match(uploadSource, /必填/);
  assert.match(uploadSource, /accept="image\/\*"/);
  assert.match(appSource, /publicApi\.uploadImageAsset/);
  assert.match(formSource, /生成海报/);
  assert.match(formSource, /全身卡通人物备注/);
  assert.match(formSource, /上传小红书主页截图/);
});

test("xiaohongshu avatar poster page keeps the full prompt template hidden", () => {
  assert.doesNotMatch(appSource, /真实手机UI/);
  assert.doesNotMatch(formSource, /右半边身体逐渐碎裂/);
  assert.doesNotMatch(uploadSource, /强烈的消散效果/);
  assert.match(promptSource, /真实手机UI/);
  assert.match(promptSource, /右半边身体逐渐碎裂/);
  assert.match(promptSource, /强烈的消散效果/);
});
