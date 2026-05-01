# Gallery Visual Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restyle the public gallery page into a polished image-first masonry showcase.

**Architecture:** Keep all data loading in `GalleryPage` and all tile layout in `GalleryMasonry`. The change is primarily copy, component structure, and CSS presentation; API contracts remain unchanged.

**Tech Stack:** Next.js App Router, React client components, CSS Modules, existing `node:test` source checks.

---

### Task 1: Test The Visual Contract

**Files:**
- Modify: `apps/public-web/tests/gallery-page.test.mjs`

**Step 1:** Replace the old product-treatment assertions with checks for `图片库`, `公开图库`, toolbar classes, overlay classes, and absence of the old `Gallery`/`公开图片流` copy.

**Step 2:** Run `pnpm --filter public-web test -- gallery-page.test.mjs`.

**Expected:** The new test fails before implementation because the current component still contains the old copy and class names.

### Task 2: Update Gallery Components

**Files:**
- Modify: `apps/public-web/src/features/gallery/gallery-page.tsx`
- Modify: `apps/public-web/src/features/gallery/gallery-masonry.tsx`

**Step 1:** Replace `GalleryHeader` markup with masthead and toolbar sections.

**Step 2:** Change scope labels to `公开图库` and `个人图库`.

**Step 3:** Move tile metadata into overlay markup in `GalleryMasonry`.

### Task 3: Restyle The Gallery

**Files:**
- Modify: `apps/public-web/src/features/gallery/gallery-page.module.css`

**Step 1:** Add masthead, toolbar, scope control, and overlay tile styles.

**Step 2:** Remove old hero-panel/filter-card styling that is no longer used.

**Step 3:** Keep responsive column behavior and mobile toolbar wrapping.

### Task 4: Verify

**Files:**
- Test: `apps/public-web/tests/gallery-page.test.mjs`

**Step 1:** Run `pnpm --filter public-web test`.

**Step 2:** Run `pnpm --filter public-web typecheck`.

**Step 3:** Run `pnpm --filter public-web exec eslint .`.
