# Prompt Apps Character Poster Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a public "应用" module with a built-in "角色海报" mini app that hides a fixed prompt template while allowing anonymous and logged-in users to generate images with visible model selection.

**Architecture:** Keep this as a frontend-only feature. Store prompt-app metadata and prompt composition in `apps/public-web/src/features/prompt-apps/`, add two Next routes, and reuse the existing public image job API plus polling helpers. Authentication and anonymous behavior remain backend-owned through the existing `/api/public/image/jobs` rules, so the frontend adds no login gate and surfaces backend errors directly.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CSS Modules, existing `publicApi`, existing `node:test` `.mjs` helper-test pattern, `pnpm --filter public-web exec tsc --noEmit`.

---

## Required Skills During Implementation

- Use @superpowers:test-driven-development before writing implementation code.
- Use @frontend-design before building the new pages/components.
- Use @superpowers:verification-before-completion before claiming the feature is complete.

---

### Task 1: Prompt App Metadata And Hidden Template Helper

**Files:**
- Create: `apps/public-web/src/features/prompt-apps/prompt-apps.ts`
- Test: `apps/public-web/tests/prompt-apps.test.mjs`

**Step 1: Write the failing test**

Create `apps/public-web/tests/prompt-apps.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox);
  return sandbox.module.exports;
}

test("prompt app catalog exposes character poster app", () => {
  const { PROMPT_APPS } = loadPromptApps();

  assert.deepEqual(PROMPT_APPS.map((app) => app.id), ["character-poster"]);
  assert.equal(PROMPT_APPS[0].title, "角色海报");
  assert.equal(PROMPT_APPS[0].href, "/apps/character-poster");
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
  assert.doesNotMatch(prompt.split("\\n")[0], /（）/);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/public-web/tests/prompt-apps.test.mjs
```

Expected: FAIL because `prompt-apps.ts` does not exist.

**Step 3: Write minimal implementation**

Create `apps/public-web/src/features/prompt-apps/prompt-apps.ts`:

```ts
export type PromptApp = Readonly<{
  id: "character-poster";
  title: string;
  description: string;
  href: string;
  statusLabel: string;
}>;

export type CharacterPosterPromptInput = Readonly<{
  character: string;
  note: string;
}>;

export const PROMPT_APPS: readonly PromptApp[] = [
  {
    id: "character-poster",
    title: "角色海报",
    description: "输入角色与备注，生成二次元动漫插画海报。",
    href: "/apps/character-poster",
    statusLabel: "内置提示词",
  },
];

const CHARACTER_POSTER_TEMPLATE = `---

请根据【角色】自动检索该角色的原著作品名称、经典名场面、标志性动作姿态、服装配色与原著画风，并据此生成一张极致精美的二次元动漫插画海报。

【画面构成——双区域布局（16:9横版）】

◆ 左侧+中央区域（约占画面60%）：
  - 该角色的腰部以上半身特写，面向观众或微侧身，视线灵动自然。
  - 姿态与动作应完全契合角色性格与原著设定（如战斗型角色取攻击蓄力姿态；温柔型角色取优雅静谧姿态）。
  - 极致细腻地刻画：发丝光泽与飘动、眼眸虹彩层次与高光、皮肤质感与光影过渡、服饰纹理与配饰细节。
  - 背景为契合角色世界观的氛围渲染（光斑、粒子、色彩雾气等），与角色融为一体，不喧宾夺主。

◆ 右侧区域（约占画面40%）：
  - 同一角色的全身立像/动态画像，展现其最经典的「名场面」瞬间。
  - 全身画像与左侧半身像在色调和光照方向上保持和谐统一。
  - 该画像可带有轻微的发光描边或虚化过渡，使其自然嵌入整体画面。

最后是文字排版，请生成中文文字。字体要有与原著风格匹配的设计感。自动检索并排版一句原著中关于该场景的经典描写或台词写在画面左边底部，和字幕一样，在画面左上角写上该作品名称，像图标一样。字体使用优雅的衬线体。整体布局要完美融入画面，字体内没有背景。

【整体画面要求】
- 风格：忠实于原著画风的高品质二次元动漫插画，笔触细腻如同官方原画级别。
- 色调：根据角色主题自动适配（暖色系/冷色系/对比色系）。
- 画质：4K超高清（3840×2160），无噪点、无伪影。
- 构图：纯净、宏大、呼吸感充足，留白与元素分布平衡。
- 整体画面应具备可直接用作壁纸或海报的完成度。`;

export function buildCharacterPosterPrompt(input: CharacterPosterPromptInput) {
  const character = input.character.trim();
  const note = input.note.trim();
  const roleLine = note ? `【角色】= {${character}}（${note}）` : `【角色】= {${character}}`;
  return `${roleLine}\n\n${CHARACTER_POSTER_TEMPLATE}`;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
node --test apps/public-web/tests/prompt-apps.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/public-web/src/features/prompt-apps/prompt-apps.ts apps/public-web/tests/prompt-apps.test.mjs
git commit -m "feat: add prompt app template helper"
```

---

### Task 2: Add 应用 Navigation And App Center Route

**Files:**
- Modify: `apps/public-web/src/features/shell/app-shell.tsx`
- Create: `apps/public-web/src/app/apps/page.tsx`
- Create: `apps/public-web/src/features/prompt-apps/prompt-apps-home.tsx`
- Create: `apps/public-web/src/features/prompt-apps/prompt-apps.module.css`

**Step 1: Run current prompt helper test**

Run:

```bash
node --test apps/public-web/tests/prompt-apps.test.mjs
```

Expected: PASS from Task 1.

**Step 2: Update navigation**

In `apps/public-web/src/features/shell/app-shell.tsx`, add the new nav item after 生图:

```ts
const navItems = [
  { href: "/", label: "生图" },
  { href: "/apps", label: "应用" },
  { href: "/comic", label: "漫画" },
  { href: "/tasks", label: "任务" },
  { href: "/wallet", label: "钱包" },
  { href: "/login", label: "登录" },
] as const;
```

Update `MainNav` width and grid count so six labels fit without wrapping:

```tsx
<nav className="absolute left-1/2 top-1/2 hidden h-11 w-[27rem] -translate-x-1/2 -translate-y-1/2 grid-cols-6 items-center gap-1 rounded-xl md:grid">
```

**Step 3: Create app center component**

Create `apps/public-web/src/features/prompt-apps/prompt-apps-home.tsx`:

```tsx
import Link from "next/link";

import { AppShell } from "@/features/shell/app-shell";
import { PROMPT_APPS } from "./prompt-apps";
import styles from "./prompt-apps.module.css";

export function PromptAppsHome() {
  return (
    <AppShell activeHref="/apps" title="应用">
      <div className={styles.appGrid}>
        {PROMPT_APPS.map((app) => (
          <Link key={app.id} className={styles.appCard} href={app.href}>
            <span className={styles.appStatus}>{app.statusLabel}</span>
            <h2 className={styles.appTitle}>{app.title}</h2>
            <p className={styles.appDescription}>{app.description}</p>
            <span className={styles.appAction}>进入应用</span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
```

Create `apps/public-web/src/app/apps/page.tsx`:

```tsx
import { PromptAppsHome } from "@/features/prompt-apps/prompt-apps-home";

export default function AppsPage() {
  return <PromptAppsHome />;
}
```

**Step 4: Add focused styles**

Create `apps/public-web/src/features/prompt-apps/prompt-apps.module.css` with card styles. Keep file under 300 lines and avoid nested cards:

```css
.appGrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1rem;
}

.appCard {
  display: grid;
  min-height: 12rem;
  align-content: space-between;
  gap: 1rem;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 1rem;
  background: #ffffff;
  padding: 1.25rem;
  color: #111827;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.appCard:hover {
  border-color: rgba(17, 24, 39, 0.18);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
}

.appStatus {
  width: fit-content;
  border-radius: 999px;
  background: #f3f4f6;
  padding: 0.25rem 0.625rem;
  color: #6b7280;
  font-size: 0.75rem;
  font-weight: 700;
}

.appTitle {
  font-size: 1.5rem;
  font-weight: 700;
}

.appDescription {
  color: #6b7280;
  font-size: 0.9rem;
  line-height: 1.6;
}

.appAction {
  font-size: 0.875rem;
  font-weight: 700;
}
```

**Step 5: Verify**

Run:

```bash
pnpm --filter public-web exec tsc --noEmit
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/public-web/src/features/shell/app-shell.tsx apps/public-web/src/app/apps/page.tsx apps/public-web/src/features/prompt-apps/prompt-apps-home.tsx apps/public-web/src/features/prompt-apps/prompt-apps.module.css
git commit -m "feat: add prompt apps center"
```

---

### Task 3: Add Character Poster App Page And Generation Flow

**Files:**
- Create: `apps/public-web/src/app/apps/character-poster/page.tsx`
- Create: `apps/public-web/src/features/prompt-apps/character-poster-app.tsx`
- Modify: `apps/public-web/src/features/prompt-apps/prompt-apps.module.css`

**Step 1: Write the behavior before implementation**

The page must:

- load models with `publicApi.getModels()`
- filter image models with `getImageModelsState()` and `resolveImageModel()`
- require non-empty character input
- keep model selection visible
- never render the full composed prompt
- call `publicApi.generateImage()` with `requested_count: 1`, `mode: "generate"`, selected `model_code`, and hidden composed prompt
- poll through `waitForImageJobResults()`
- show explicit errors from thrown `Error`
- preserve user inputs on failure

**Step 2: Create route**

Create `apps/public-web/src/app/apps/character-poster/page.tsx`:

```tsx
import { CharacterPosterApp } from "@/features/prompt-apps/character-poster-app";

export default function CharacterPosterPage() {
  return <CharacterPosterApp />;
}
```

**Step 3: Implement component in small helpers**

Create `apps/public-web/src/features/prompt-apps/character-poster-app.tsx`.

Use these local types:

```ts
type PosterForm = Readonly<{
  character: string;
  note: string;
  modelCode: string;
}>;

type PosterState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "success"; jobId: number; images: readonly PosterImage[] }>
  | Readonly<{ status: "error"; message: string }>;

type PosterImage = Readonly<{
  id: string;
  url: string;
  assetId: number;
}>;
```

Structure the component with short functions:

- `CharacterPosterApp()`
- `handleSubmit()`
- `PosterFormPanel()`
- `PosterResultPanel()`
- `ModelSelect()`
- `PosterImageGrid()`
- `getSubmitDisabled()`
- `getErrorMessage()`

Important submit snippet:

```ts
const result = await publicApi.generateImage({
  prompt: buildCharacterPosterPrompt({ character: form.character, note: form.note }),
  model_code: resolvedModelCode,
  requested_count: 1,
  mode: "generate",
});
const completed = await waitForImageJobResults(publicApi, result.id);
setState({
  status: "success",
  jobId: completed.job.id,
  images: imageJobResultsToHistoryImages(completed.results),
});
```

Do not include any JSX that prints `buildCharacterPosterPrompt(...)` or the composed prompt.

**Step 4: Add workspace styles**

Extend `prompt-apps.module.css` with:

- `.posterWorkspace`
- `.posterPanel`
- `.posterResult`
- `.fieldGroup`
- `.textarea`
- `.modelSelect`
- `.resultStage`
- `.posterImageGrid`
- `.posterImageCard`

Keep the visual language aligned with existing studio UI: restrained white surfaces, clear form fields, stable result area, no nested cards.

**Step 5: Verify typecheck**

Run:

```bash
pnpm --filter public-web exec tsc --noEmit
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/public-web/src/app/apps/character-poster/page.tsx apps/public-web/src/features/prompt-apps/character-poster-app.tsx apps/public-web/src/features/prompt-apps/prompt-apps.module.css
git commit -m "feat: add character poster prompt app"
```

---

### Task 4: Add Regression Checks For Hidden Prompt And Anonymous Path Assumption

**Files:**
- Modify: `apps/public-web/tests/prompt-apps.test.mjs`
- Modify: `apps/public-web/src/features/prompt-apps/character-poster-app.tsx`

**Step 1: Extend helper test for no login gating contract**

Add a test that documents the frontend access contract through exported metadata:

```js
test("character poster app is public and relies on image job API access rules", () => {
  const { PROMPT_APPS } = loadPromptApps();
  const app = PROMPT_APPS.find((item) => item.id === "character-poster");

  assert.equal(app.access, "public-image-job-api");
});
```

Then update `PromptApp` metadata with:

```ts
access: "public-image-job-api";
```

**Step 2: Verify the test**

Run:

```bash
node --test apps/public-web/tests/prompt-apps.test.mjs
```

Expected: PASS after metadata update.

**Step 3: Manual code review checkpoint**

Inspect `character-poster-app.tsx` and verify:

- no import from auth helpers
- no redirect to `/login`
- no `isUnauthorizedApiError` special handling that masks errors
- no prompt preview/rendering
- `publicApi.generateImage()` is used directly

**Step 4: Full public-web verification**

Run:

```bash
node --test apps/public-web/tests/prompt-apps.test.mjs
pnpm --filter public-web exec tsc --noEmit
pnpm --filter public-web build
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add apps/public-web/tests/prompt-apps.test.mjs apps/public-web/src/features/prompt-apps/prompt-apps.ts apps/public-web/src/features/prompt-apps/character-poster-app.tsx
git commit -m "test: cover prompt app public access contract"
```

---

### Task 5: Final Review And Acceptance

**Files:**
- Review: `apps/public-web/src/features/shell/app-shell.tsx`
- Review: `apps/public-web/src/app/apps/page.tsx`
- Review: `apps/public-web/src/app/apps/character-poster/page.tsx`
- Review: `apps/public-web/src/features/prompt-apps/*`
- Review: `apps/public-web/tests/prompt-apps.test.mjs`

**Step 1: Check git status**

Run:

```bash
git status --short
```

Expected: only intended files are changed or clean after commits. Existing unrelated untracked files must remain untouched.

**Step 2: Run final verification**

Run:

```bash
node --test apps/public-web/tests/prompt-apps.test.mjs
pnpm --filter public-web exec tsc --noEmit
pnpm --filter public-web build
```

Expected: all PASS.

**Step 3: Optional local browser check**

Run:

```bash
pnpm dev:public
```

Open:

```text
http://localhost:7700/apps
http://localhost:7700/apps/character-poster
```

Verify:

- top nav shows 应用
- `/apps` shows 角色海报
- `/apps/character-poster` shows character/note/model controls
- full prompt is not visible
- anonymous user is not redirected to login
- backend errors are visible if anonymous generation is disabled

**Step 4: Final commit if needed**

If Step 1 shows final uncommitted implementation changes:

```bash
git add <only intended files>
git commit -m "chore: finalize character poster app"
```

