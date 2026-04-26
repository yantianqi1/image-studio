# Single Character Reference Sheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a task-level comic character reference mode that can use one shared all-character reference sheet instead of one image per character.

**Architecture:** Keep the existing per-character flow unchanged. Store the selected mode in `comic_tasks.input_payload`, branch only in character reference orchestration, and reuse the current `ComicCharacterCard.reference_image_job_id` / `reference_asset_id` columns by assigning all cards to the same job and asset in single-sheet mode.

**Tech Stack:** FastAPI/Python backend, SQLAlchemy models, existing image job queue, Next.js public web UI, focused pytest and TypeScript checks.

---

### Task 1: Backend Reference Mode Behavior

**Files:**
- Modify: `apps/api/app/domains/comic/character_references.py`
- Modify: `apps/api/app/domains/comic/pipeline.py`
- Test: `apps/api/tests/test_comic_character_references.py`
- Test: `apps/api/tests/test_comic_image_generation.py`

**Step 1: Write failing tests**

Add tests proving:
- `single_sheet` creates exactly one image job for all character cards.
- all character cards get the same `reference_image_job_id`.
- sync copies the completed asset to every character card.
- page image generation deduplicates the shared reference asset.

**Step 2: Run tests to verify RED**

Run with 60 second timeout:
`docker exec commercial-studio-api python -c 'import subprocess, sys; result = subprocess.run(["pytest", "-q", "apps/api/tests/test_comic_character_references.py", "apps/api/tests/test_comic_image_generation.py"], timeout=60); sys.exit(result.returncode)'`

Expected: new tests fail because the current implementation creates one reference job per character.

**Step 3: Implement backend mode branch**

Add constants for `per_character` and `single_sheet`. Parse invalid modes explicitly. For `single_sheet`, build one neutral all-character design-sheet prompt from `ComicCharacterCard` fields and assign one image job to all cards.

**Step 4: Run backend tests to verify GREEN**

Run the same pytest command. Expected: pass.

### Task 2: Frontend Task Selection

**Files:**
- Modify: `apps/public-web/src/features/comic/manga-project-panel.tsx`
- Modify: `apps/public-web/src/features/comic/comic-studio.tsx`
- Modify: `apps/public-web/src/lib/public-api.ts` if types need widening

**Step 1: Add UI state and payload**

Add a compact segmented/select control for character reference mode. Default to `single_sheet` only if product decision requires it; otherwise keep `per_character` to preserve existing behavior.

**Step 2: Run frontend verification**

Run:
`pnpm --filter public-web exec tsc --noEmit`

Expected: pass.

### Task 3: Final Verification

Run focused backend tests and public-web typecheck. Restart `api` and `worker` so the running app uses the new backend branch.
