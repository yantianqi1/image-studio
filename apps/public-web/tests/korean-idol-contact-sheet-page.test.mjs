import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/features/prompt-apps/korean-idol-contact-sheet-app.tsx", import.meta.url),
  "utf8",
);

const pageSource = readFileSync(
  new URL("../src/app/apps/korean-idol-contact-sheet/page.tsx", import.meta.url),
  "utf8",
);

const formSource = readFileSync(
  new URL("../src/features/prompt-apps/korean-idol-contact-sheet-form.tsx", import.meta.url),
  "utf8",
);

const uploadSource = readFileSync(
  new URL("../src/features/prompt-apps/korean-idol-contact-sheet-upload.tsx", import.meta.url),
  "utf8",
);

const promptSource = readFileSync(
  new URL("../src/features/prompt-apps/korean-idol-contact-sheet-prompt.ts", import.meta.url),
  "utf8",
);

test("korean idol contact sheet route renders the app component", () => {
  assert.match(pageSource, /import \{ KoreanIdolContactSheetApp \}/);
  assert.match(pageSource, /return <KoreanIdolContactSheetApp \/>/);
});

test("korean idol contact sheet page exposes upload form and app center back link", () => {
  assert.match(appSource, /headerTitle="韩系偶像九宫格"/);
  assert.match(appSource, /aria-label="返回应用中心"/);
  assert.match(appSource, /href="\/apps"/);
  assert.match(uploadSource, /参考图/);
  assert.match(uploadSource, /可选/);
  assert.doesNotMatch(uploadSource, /参考图必填/);
  assert.match(uploadSource, /accept="image\/\*"/);
  assert.match(appSource, /publicApi\.uploadImageAsset/);
  assert.match(formSource, /生成九宫格/);
  assert.match(formSource, /上传参考图可保持同一人物身份/);
});

test("korean idol contact sheet page keeps the full prompt template hidden", () => {
  assert.doesNotMatch(appSource, /professional photoshoot contact sheet/);
  assert.doesNotMatch(appSource, /Extremely consistent identity/);
  assert.doesNotMatch(formSource, /professional photoshoot contact sheet/);
  assert.doesNotMatch(uploadSource, /Extremely consistent identity/);
  assert.match(promptSource, /professional photoshoot contact sheet/);
  assert.match(promptSource, /Extremely consistent identity/);
});
