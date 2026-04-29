import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadPromptApps() {
  const source = readFileSync(new URL("../src/features/prompt-apps/prompt-apps.ts", import.meta.url), "utf8");
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
      if (path === "./korean-idol-contact-sheet-prompt") {
        return loadKoreanIdolContactSheetPrompt();
      }
      if (path === "./city-poster-prompt") {
        return loadCityPosterPrompt();
      }
      throw new Error(`Unexpected require: ${path}`);
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

function loadKoreanIdolContactSheetPrompt() {
  const source = readFileSync(
    new URL("../src/features/prompt-apps/korean-idol-contact-sheet-prompt.ts", import.meta.url),
    "utf8",
  );
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

function loadCityPosterPrompt() {
  const source = readFileSync(
    new URL("../src/features/prompt-apps/city-poster-prompt.ts", import.meta.url),
    "utf8",
  );
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

test("prompt app catalog exposes character poster app", () => {
  const { PROMPT_APPS } = loadPromptApps();

  assert.deepEqual(Array.from(PROMPT_APPS, (app) => app.id), [
    "character-poster",
    "encyclopedia-card",
    "silhouette-universe-poster",
    "korean-idol-contact-sheet",
    "city-poster",
  ]);
  assert.equal(PROMPT_APPS[0].title, "角色海报");
  assert.equal(PROMPT_APPS[0].href, "/apps/character-poster");
  assert.equal(PROMPT_APPS[0].cover.label, "角色海报");
  assert.equal(PROMPT_APPS[0].cover.imageSrc, "/app-covers/character-poster-hutao.png");
});

test("prompt app catalog exposes encyclopedia card app", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "encyclopedia-card");

  assert.equal(app.title, "科普百科图");
  assert.equal(app.href, "/apps/encyclopedia-card");
  assert.equal(app.cover.label, "科普百科图");
  assert.equal(app.cover.imageSrc, "/app-covers/encyclopedia-card-hajimi.png");
  assert.equal(app.cover.aspectRatio, "3:4");
  assert.equal(app.statusLabel, "内置提示词");
});

test("encyclopedia card app cover asset is a 3:4 PNG", () => {
  const dimensions = readPngDimensions("apps/public-web/public/app-covers/encyclopedia-card-hajimi.png");

  assert.equal(dimensions.width * 4, dimensions.height * 3);
});

test("prompt app catalog exposes silhouette universe poster app", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "silhouette-universe-poster");

  assert.equal(app.title, "轮廓宇宙海报");
  assert.equal(app.href, "/apps/silhouette-universe-poster");
  assert.equal(app.cover.label, "轮廓宇宙海报");
  assert.equal(app.cover.imageSrc, "/app-covers/silhouette-universe-poster.png");
  assert.equal(app.cover.aspectRatio, "3:4");
  assert.equal(app.statusLabel, "内置提示词");
});

test("silhouette universe poster app cover asset is a 3:4 PNG", () => {
  const dimensions = readPngDimensions("apps/public-web/public/app-covers/silhouette-universe-poster.png");

  assert.equal(dimensions.width * 4, dimensions.height * 3);
});

test("prompt app catalog exposes korean idol contact sheet app", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "korean-idol-contact-sheet");

  assert.equal(app.title, "韩系偶像九宫格");
  assert.equal(app.href, "/apps/korean-idol-contact-sheet");
  assert.equal(app.cover.label, "韩系偶像九宫格");
  assert.equal(app.cover.imageSrc, "/app-covers/korean-idol-contact-sheet.png");
  assert.equal(app.cover.aspectRatio, "9:16");
  assert.equal(app.statusLabel, "内置提示词");
});

test("korean idol contact sheet app cover asset uses the provided preview PNG", () => {
  const coverDimensions = readPngDimensions("apps/public-web/public/app-covers/korean-idol-contact-sheet.png");
  const sourceDimensions = readPngDimensions("app_image/九宫格.png");

  assert.deepEqual(coverDimensions, sourceDimensions);
});

test("prompt app catalog exposes city poster app", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "city-poster");

  assert.equal(app.title, "城市宣传海报");
  assert.equal(app.href, "/apps/city-poster");
  assert.equal(app.cover.label, "城市宣传海报");
  assert.equal(app.cover.imageSrc, "/app-covers/city-poster.svg");
  assert.equal(app.cover.aspectRatio, "9:16");
  assert.equal(app.statusLabel, "内置提示词");
});

test("city poster app cover asset declares a stable 9:16 SVG viewport", () => {
  const viewport = readSvgViewport("apps/public-web/public/app-covers/city-poster.svg");

  assert.equal(viewport.width * 16, viewport.height * 9);
});

test("character poster app is public and relies on image job API access rules", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "character-poster");

  assert.equal(app.access, "public-image-job-api");
});

test("buildCharacterPosterPrompt inserts character and note", () => {
  const { buildCharacterPosterPrompt } = loadPromptApps();
  const prompt = buildCharacterPosterPrompt({ character: "张夏", note: "网络小说青山的女主" });

  assert.match(prompt, /【角色】= \{张夏\}（网络小说青山的女主）/);
  assert.match(prompt, /16:9横版/);
  assert.match(prompt, /中文文字/);
  assert.match(prompt, /4K超高清/);
});

test("buildCharacterPosterPrompt trims input and omits empty note wrapper", () => {
  const { buildCharacterPosterPrompt } = loadPromptApps();
  const prompt = buildCharacterPosterPrompt({ character: "  张夏  ", note: "   " });

  assert.match(prompt, /【角色】= \{张夏\}/);
  assert.doesNotMatch(prompt.split("\n")[0], /（）/);
});

test("buildEncyclopediaCardPrompt inserts topic and note", () => {
  const { buildEncyclopediaCardPrompt } = loadPromptApps();
  const prompt = buildEncyclopediaCardPrompt({ topic: "狸花猫", note: "适合新手养猫家庭" });

  assert.match(prompt, /【主题】= \{狸花猫\}（适合新手养猫家庭）/);
  assert.match(prompt, /高质量竖版「科普百科图」/);
  assert.match(prompt, /图鉴感、百科感、信息结构感、收藏感/);
  assert.match(prompt, /Top 5模块/);
});

test("buildEncyclopediaCardPrompt trims input and omits empty note wrapper", () => {
  const { buildEncyclopediaCardPrompt } = loadPromptApps();
  const prompt = buildEncyclopediaCardPrompt({ topic: "  狸花猫  ", note: "   " });

  assert.match(prompt, /【主题】= \{狸花猫\}/);
  assert.doesNotMatch(prompt.split("\n")[0], /（）/);
});

test("buildSilhouetteUniversePosterPrompt inserts topic and note", () => {
  const { buildSilhouetteUniversePosterPrompt } = loadPromptApps();
  const prompt = buildSilhouetteUniversePosterPrompt({ topic: "海底图书馆", note: "偏神圣、安静" });

  assert.match(prompt, /【主题】= \{海底图书馆\}（偏神圣、安静）/);
  assert.match(prompt, /轮廓宇宙 \/ 收藏版叙事海报/);
  assert.match(prompt, /主轮廓载体/);
  assert.match(prompt, /梦幻水彩质感与纸张印刷品气质/);
});

test("buildSilhouetteUniversePosterPrompt trims input and omits empty note wrapper", () => {
  const { buildSilhouetteUniversePosterPrompt } = loadPromptApps();
  const prompt = buildSilhouetteUniversePosterPrompt({ topic: "  海底图书馆  ", note: "   " });

  assert.match(prompt, /【主题】= \{海底图书馆\}/);
  assert.doesNotMatch(prompt.split("\n")[0], /（）/);
});

test("buildKoreanIdolContactSheetPrompt inserts reference line when uploaded", () => {
  const { buildKoreanIdolContactSheetPrompt } = loadPromptApps();
  const prompt = buildKoreanIdolContactSheetPrompt({
    hasReferenceImage: true,
    note: "偏清晨、干净室内",
  });

  assert.match(prompt, /【参考图】= 使用上传图片中的同一位成年女性人物作为九张照片唯一身份参考。/);
  assert.match(prompt, /【备注】= \{偏清晨、干净室内\}/);
  assert.match(prompt, /9:16 vertical/);
  assert.match(prompt, /3x3 grid collage/);
  assert.match(prompt, /professional photoshoot contact sheet/);
});

test("buildKoreanIdolContactSheetPrompt uses original identity without upload", () => {
  const { buildKoreanIdolContactSheetPrompt } = loadPromptApps();
  const prompt = buildKoreanIdolContactSheetPrompt({ hasReferenceImage: false, note: "   " });

  assert.match(prompt, /原创成年韩系女性偶像人物/);
  assert.doesNotMatch(prompt, /上传图片/);
  assert.doesNotMatch(prompt, /【备注】=/);
  assert.match(prompt, /adult Korean female idol portrait photoshoot series/);
});

test("buildCityPosterPrompt inserts city and note", () => {
  const { buildCityPosterPrompt } = loadPromptApps();
  const prompt = buildCityPosterPrompt({ city: "杭州", note: "突出西湖、钱塘江、良渚文化" });

  assert.match(prompt, /【城市】= \{杭州\}（突出西湖、钱塘江、良渚文化）/);
  assert.match(prompt, /2026 城市宣传海报/);
  assert.match(prompt, /长长的红色丝绸舞带/);
  assert.match(prompt, /根据【城市】自动选取代表性地标/);
  assert.doesNotMatch(prompt, /上海城市手绘图/);
  assert.doesNotMatch(prompt, /东方明珠广播电视塔/);
});

test("buildCityPosterPrompt trims input and omits empty note wrapper", () => {
  const { buildCityPosterPrompt } = loadPromptApps();
  const prompt = buildCityPosterPrompt({ city: "  成都  ", note: "   " });

  assert.match(prompt, /【城市】= \{成都\}/);
  assert.doesNotMatch(prompt.split("\n")[0], /（）/);
});

function readPngDimensions(path) {
  const header = readFileSync(path).subarray(0, 24);
  assert.equal(header.toString("ascii", 1, 4), "PNG");
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

function readSvgViewport(path) {
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, "utf8");
  const match = source.match(/viewBox="0 0 (?<width>\d+) (?<height>\d+)"/);
  assert.ok(match?.groups);
  return {
    width: Number(match.groups.width),
    height: Number(match.groups.height),
  };
}
