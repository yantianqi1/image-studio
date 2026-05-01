# Gallery Responsive Density Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the public gallery show more thumbnails on phone and tablet screens without changing the desktop layout.

**Architecture:** Keep the existing React masonry component and measured column-balancing algorithm. Change only the responsive column-count constants, thumbnail `sizes`, and sub-1180px CSS density rules.

**Tech Stack:** Next.js client component, React, CSS Modules, Node test runner.

---

### Task 1: Regression Tests

**Files:**
- Modify: `apps/public-web/tests/gallery-page.test.mjs`

**Step 1: Write the failing test**

Add assertions that:
- `GALLERY_MASONRY_BREAKPOINTS` maps `1180 -> 4`, `820 -> 4`, and `540 -> 3`.
- `MIN_GALLERY_COLUMN_COUNT` is `2`.
- Thumbnail `sizes` uses `25vw`, `25vw`, `33vw`, and `50vw`.
- The mobile CSS fallback does not set `.galleryGrid` to a single `1fr` column.

**Step 2: Run test to verify it fails**

Run: `node --test apps/public-web/tests/gallery-page.test.mjs`

Expected: FAIL because current code still uses one mobile column and lower tablet density.

### Task 2: Responsive Masonry Density

**Files:**
- Modify: `apps/public-web/src/features/gallery/gallery-masonry.tsx`
- Modify: `apps/public-web/src/features/gallery/gallery-page.module.css`

**Step 1: Write minimal implementation**

Change:
- `MIN_GALLERY_COLUMN_COUNT` from `1` to `2`.
- Breakpoint columns to `{ 1180: 4 }, { 820: 4 }, { 540: 3 }`.
- Thumbnail `sizes` to match the new column widths.
- CSS media queries below `1180px` so gaps, radius, badges, and actions remain usable in compact columns.

**Step 2: Run test to verify it passes**

Run: `node --test apps/public-web/tests/gallery-page.test.mjs`

Expected: PASS.

### Task 3: Verification

**Files:**
- Test only.

**Step 1: Run targeted public-web tests**

Run: `pnpm --filter public-web test`

Expected: PASS.

**Step 2: Run typecheck**

Run: `pnpm --filter public-web typecheck`

Expected: PASS.
