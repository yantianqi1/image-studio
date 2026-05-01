# Gallery Thumbnails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Serve proportional compressed thumbnails in the gallery stream while keeping original images for preview and download.

**Architecture:** Add a backend thumbnail endpoint that derives thumbnails from stored assets on demand. Extend gallery payloads and public-web types with `thumbnail_url`, then point the masonry tile image source at that URL.

**Tech Stack:** FastAPI, SQLAlchemy, Pillow, Next.js/React, Node test runner, pytest.

---

### Task 1: Backend Gallery Thumbnail API

**Files:**
- Modify: `apps/api/app/domains/image/assets.py`
- Modify: `apps/api/app/domains/image/routes.py`
- Test: `apps/api/tests/test_image_gallery.py`

**Steps:**
1. Add failing tests that gallery payloads include `thumbnail_url`, thumbnail requests preserve aspect ratio, and private thumbnail access stays owner-scoped.
2. Run the narrow pytest command with a 60 second timeout and confirm the tests fail because the endpoint/field is missing.
3. Add thumbnail rendering helpers using Pillow. Keep maximum dimension at 640px and preserve aspect ratio.
4. Add `/image/assets/{asset_id}/thumbnail` route.
5. Add `thumbnail_url` to gallery payloads.
6. Run the narrow pytest command again and confirm it passes.

### Task 2: Public Web Gallery Uses Thumbnails

**Files:**
- Modify: `apps/public-web/src/lib/public-api.ts`
- Modify: `apps/public-web/src/features/gallery/gallery-masonry.tsx`
- Test: `apps/public-web/tests/gallery-page.test.mjs`

**Steps:**
1. Add failing static tests that gallery tile images use `thumbnail_url` and preview/download keep `asset_url`.
2. Run the targeted node test and confirm it fails.
3. Add `thumbnail_url` to `ImageGalleryItem`.
4. Update masonry tile `<img src>` to use `thumbnail_url`.
5. Run targeted node test and confirm it passes.

### Task 3: Verification

**Commands:**
- Backend: run targeted pytest through a 60 second timeout wrapper.
- Frontend: `pnpm --filter public-web test`
- Frontend: `pnpm --filter public-web typecheck`
- Frontend: `pnpm --filter public-web lint`
- Line count: `wc -l` on touched files.
