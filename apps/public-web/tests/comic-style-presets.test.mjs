import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("apps/public-web/src/features/comic/comic-style-presets.ts", "utf8");

test("comic style presets expose seven selectable styles", () => {
  for (const label of ["水墨风漫画", "工笔重彩漫画", "线性新国风漫画", "白描武侠漫画", "国潮Q版漫画", "暗黑志怪风漫画", "国风3D精美动漫"]) {
    assert.match(source, new RegExp(label));
  }
});

test("comic studio defaults to neo Chinese style", () => {
  assert.match(source, /DEFAULT_COMIC_STYLE_PRESET:[^\n]*"neo_chinese"/);
});
