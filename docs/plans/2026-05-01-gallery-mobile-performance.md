# Gallery Mobile Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve mobile gallery opening and scrolling smoothness without visible UI changes.

**Architecture:** Keep the existing public-web gallery UI and masonry algorithm. Reduce React work by batching image measurement updates, and reduce browser paint/layout work for offscreen cards through CSS containment hints.

**Tech Stack:** Next.js/React, CSS Modules, Node test runner, TypeScript.

---

### Task 1: Add Regression Tests

**Files:**
- Modify: `apps/public-web/tests/gallery-page.test.mjs`

**Steps:**
1. Add failing static tests that require animation-frame batching for masonry measurements.
2. Add failing static tests that require offscreen rendering hints on gallery tiles.
3. Run: `pnpm --filter public-web test`
4. Expected: FAIL because the batching and CSS hints are not present yet.

### Task 2: Implement Batched Image Measurements

**Files:**
- Modify: `apps/public-web/src/features/gallery/gallery-masonry.tsx`

**Steps:**
1. Add refs for pending aspect-ratio measurements and the scheduled animation-frame id.
2. Replace direct state writes in `onLoad` with a batched `queueImageAspectRatio` callback.
3. Flush pending ratios once per animation frame.
4. Cancel any pending animation frame on unmount.
5. Keep the existing `buildMeasuredGalleryColumns` behavior unchanged.

### Task 3: Add CSS Rendering Hints

**Files:**
- Modify: `apps/public-web/src/features/gallery/gallery-page.module.css`

**Steps:**
1. Add `content-visibility: auto` to `.tile`.
2. Add `contain-intrinsic-size` with a realistic gallery-card placeholder.
3. Do not remove or alter existing visible styles.

### Task 4: Verify

**Commands:**
- `pnpm --filter public-web test`
- `pnpm --filter public-web typecheck`
- `pnpm --filter public-web lint`
