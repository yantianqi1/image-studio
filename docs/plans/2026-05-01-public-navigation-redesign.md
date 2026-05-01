# Public Navigation Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the public web navigation so `https://image2.mom/` feels like a polished image-flow product homepage instead of a development control surface.

**Architecture:** Keep `/` as the public gallery stream and `/generate` as the creation workspace. Split the header into product navigation, quota/account actions, and a dedicated provider settings popover so API configuration no longer crowds the main navigation. Use CSS modules for shell styling and keep global styles limited to shared primitives.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CSS modules, existing public API client, Node test runner.

---

### Task 1: Lock the New Navigation Information Architecture

**Files:**
- Modify: `apps/public-web/tests/app-navigation.test.mjs`
- Modify: `apps/public-web/tests/gallery-page.test.mjs`

**Step 1: Write the failing tests**

Add assertions that:

```js
assert.equal(APP_NAV_ITEMS[0].label, "图库");
assert.equal(APP_NAV_ITEMS[0].href, "/");
assert.equal(APP_NAV_ITEMS[1].label, "生成");
assert.equal(APP_NAV_ITEMS[1].href, "/generate");
assert.match(appShellSource, /ProviderSettingsPopover/);
assert.match(appShellSource, /CreateAction/);
assert.match(homePageSource, /initialScope="public"/);
```

Also assert the visible top nav no longer renders raw provider URL inputs inline:

```js
assert.doesNotMatch(appShellSource, /OpenAI 兼容 URL/);
assert.doesNotMatch(appShellSource, /API Key/);
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter public-web test
```

Expected: FAIL because provider controls still render inline and the refined shell components do not exist.

### Task 2: Extract a Premium App Header

**Files:**
- Modify: `apps/public-web/src/features/shell/app-shell.tsx`
- Modify: `apps/public-web/src/features/shell/app-navigation.ts`
- Create: `apps/public-web/src/features/shell/app-header.module.css`
- Modify: `apps/public-web/src/app/globals.css`
- Test: `apps/public-web/tests/app-navigation.test.mjs`

**Step 1: Implement header structure**

Replace the current mixed header layout with:

```text
image2.mom | 图库 生成 漫画 应用 | + 生成 | 20/20 | 头像/设置
```

Rules:
- `APP_NAV_ITEMS` only contains primary product areas: `图库`, `生成`, `漫画`, `应用`.
- `任务`, `钱包`, `登录`, provider settings move to the account/settings area.
- Brand link stays `/`.
- The primary CTA links to `/generate` and uses label `+ 生成`.
- Active nav uses a refined dark/ink or emerald active pill.

**Step 2: Move styles out of global CSS**

Create `app-header.module.css` for:
- `header`
- `headerInner`
- `brand`
- `nav`
- `navItem`
- `navItemActive`
- `createButton`
- `quotaBadge`
- `accountButton`
- `mobileNav`

Keep `globals.css` only for broad shared primitives. Remove or reduce `.nav-pill` if it becomes shell-specific.

**Step 3: Run tests**

Run:

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/public-web/src/features/shell apps/public-web/src/app/globals.css apps/public-web/tests
git commit -m "feat(public-web): redesign public navigation"
```

### Task 3: Move Provider Controls Into a Settings Popover

**Files:**
- Modify: `apps/public-web/src/features/shell/client-provider-controls.tsx`
- Create: `apps/public-web/src/features/shell/provider-settings-popover.tsx`
- Create: `apps/public-web/src/features/shell/provider-settings-popover.module.css`
- Test: `apps/public-web/tests/client-provider-controls.test.mjs`

**Step 1: Write failing tests**

Assert:

```js
assert.match(source, /ProviderSettingsPopover/);
assert.match(popoverSource, /通道设置/);
assert.match(popoverSource, /OpenAI 兼容 URL/);
assert.match(popoverSource, /API Key/);
```

**Step 2: Implement popover**

Requirements:
- Header only shows a compact settings/account button, not raw URL/key fields.
- Popover contains URL input, API key input, enabled status, and clear action.
- Existing localStorage/provider header behavior remains unchanged.
- No mock or fallback behavior.
- API key remains password-masked.

**Step 3: Run tests**

Run:

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/public-web/src/features/shell apps/public-web/tests/client-provider-controls.test.mjs
git commit -m "feat(public-web): move provider settings into popover"
```

### Task 4: Refine the Gallery Homepage Hero and Filter Bar

**Files:**
- Modify: `apps/public-web/src/features/gallery/gallery-page.tsx`
- Modify: `apps/public-web/src/features/gallery/gallery-page.module.css`
- Test: `apps/public-web/tests/gallery-page.test.mjs`

**Step 1: Write failing tests**

Assert:

```js
assert.match(gallerySource, /公开图片流/);
assert.match(gallerySource, /来自 image2\.mom/);
assert.match(stylesSource, /heroPanel/);
assert.match(stylesSource, /filterBar/);
```

**Step 2: Implement homepage treatment**

For `initialScope="public"`:
- Title: `公开图片流`
- Subtitle: `来自 image2.mom 用户生成的精选图像`
- Use a compact hero band, not a marketing card.
- Filter bar contains `公开流 / 我的图库`.
- Keep current empty/error/loading states explicit.

For `/gallery` with `initialScope="mine"`:
- Title: `我的图库`
- Keep scope switching visible.

**Step 3: Run tests**

Run:

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/public-web/src/features/gallery apps/public-web/tests/gallery-page.test.mjs
git commit -m "feat(public-web): polish gallery homepage"
```

### Task 5: Add Mobile Product Navigation

**Files:**
- Modify: `apps/public-web/src/features/shell/app-shell.tsx`
- Modify: `apps/public-web/src/features/shell/app-header.module.css`
- Test: `apps/public-web/tests/app-navigation.test.mjs`

**Step 1: Write failing tests**

Assert mobile nav has only:

```js
图库, 生成, 漫画, 我的
```

and does not expose:

```js
任务, 钱包, 登录
```

as primary mobile tabs.

**Step 2: Implement mobile nav**

Rules:
- Bottom or sticky lower header mobile nav has 4 items: `图库`, `生成`, `漫画`, `我的`.
- `我的` opens/links to account area where settings, wallet, login, tasks live.
- Keep labels short and non-overlapping at narrow widths.

**Step 3: Run tests**

Run:

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/public-web/src/features/shell apps/public-web/tests/app-navigation.test.mjs
git commit -m "feat(public-web): simplify mobile navigation"
```

### Task 6: Final Verification

**Files:**
- No new files unless fixes are needed.

**Step 1: Run frontend checks**

Run:

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

Expected: PASS.

**Step 2: Verify local routes**

With API on `7800` and public web on `7700`, run:

```bash
curl -i http://localhost:7700/
curl -i http://localhost:7700/generate
curl -i http://localhost:7700/api/public/image/gallery?scope=public
```

Expected: all return HTTP 200.

**Step 3: File boundary check**

Run:

```bash
wc -l apps/public-web/src/features/shell/*.tsx apps/public-web/src/features/shell/*.css apps/public-web/src/features/gallery/*.tsx apps/public-web/src/features/gallery/*.css
```

Expected: every touched file stays under 300 lines.

**Step 4: Commit final fixes if needed**

```bash
git add <changed-files>
git commit -m "fix(public-web): stabilize navigation redesign"
```
