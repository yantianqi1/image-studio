# Prompt Apps Encyclopedia Card Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a built-in "科普百科图" prompt mini app that lets users enter a topic such as "狸花猫" and generate a vertical modular encyclopedia infographic.

**Architecture:** Keep this frontend-only. Extend the existing prompt app catalog and hidden template helpers, add a page-level client component under `features/prompt-apps`, and reuse `publicApi.generateImage()`, model filtering, polling, result panel, and existing CSS module styles.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CSS Modules, `node:test`, `pnpm --filter public-web test`, `pnpm --filter public-web typecheck`.

---

### Task 1: Catalog And Prompt Helper

**Files:**
- Modify: `apps/public-web/src/features/prompt-apps/prompt-apps.ts`
- Modify: `apps/public-web/tests/prompt-apps.test.mjs`

**Steps:**
1. Add failing tests for the second app metadata and `buildEncyclopediaCardPrompt()`.
2. Run `node --test apps/public-web/tests/prompt-apps.test.mjs` and confirm failure.
3. Add metadata for `encyclopedia-card` and the hidden prompt builder.
4. Re-run the prompt apps test.

### Task 2: App State

**Files:**
- Create: `apps/public-web/src/features/prompt-apps/encyclopedia-card-app-state.ts`
- Create: `apps/public-web/tests/encyclopedia-card-app-state.test.mjs`

**Steps:**
1. Test required topic/model validation.
2. Test request construction uses `requested_count: 1`, `mode: "generate"`, and the hidden prompt.
3. Implement minimal state helpers.
4. Re-run the state test.

### Task 3: Page Component And Route

**Files:**
- Create: `apps/public-web/src/features/prompt-apps/encyclopedia-card-app.tsx`
- Create: `apps/public-web/src/app/apps/encyclopedia-card/page.tsx`
- Modify: `apps/public-web/src/features/prompt-apps/prompt-apps.module.css`
- Create: `apps/public-web/tests/encyclopedia-card-page.test.mjs`

**Steps:**
1. Add source-level test for route component, back link, topic copy, and hidden prompt non-display.
2. Implement the component by mirroring the existing character poster app structure.
3. Add only shared/necessary CSS classes.
4. Re-run page test.

### Task 4: Full Verification

**Commands:**
- `pnpm --filter public-web test`
- `pnpm --filter public-web typecheck`
- `curl -sS -o /tmp/encyclopedia-card.html -w "%{http_code}\n" http://127.0.0.1:7700/apps/encyclopedia-card`

Expected: tests and typecheck exit 0; page returns 200 when the fixed public dev server is already running.
