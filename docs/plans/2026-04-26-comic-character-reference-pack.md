# Comic Character Reference Pack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add one-click export and import of comic character reference packs so users can reuse finished character designs in later comic tasks.

**Architecture:** The API owns zip creation and zip import validation. Export reads ready `ComicCharacterCard` rows and their `Asset` files, writes `characters.json` plus renamed images into a zip response, and import validates a zip upload before creating new `Asset` rows and binding them to current character cards. The frontend adds a small upload/download control that calls these endpoints and surfaces explicit errors.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, Python `zipfile`, existing `Asset` storage helpers, pytest, Next.js, TypeScript.

---

### Task 1: Backend Export Tests

**Files:**
- Test: `apps/api/tests/test_comic_character_reference_pack.py`
- Modify later: `apps/api/app/domains/comic/character_reference_packs.py`
- Modify later: `apps/api/app/domains/comic/router.py`

**Step 1: Write failing export tests**

Create tests proving:

- `GET /api/public/comic/tasks/{task_id}/character-references/export` returns a zip.
- the zip contains `characters.json`.
- images are named from character names.
- export fails with `comic_character_references_not_ready` when any card lacks `reference_asset_id`.

**Step 2: Run tests to verify RED**

Run:

```bash
python -c 'import subprocess, sys; result = subprocess.run(["pytest", "-q", "apps/api/tests/test_comic_character_reference_pack.py"], timeout=60); sys.exit(result.returncode)'
```

Expected: fail because the route and service do not exist.

**Step 3: Implement minimal export service**

Create `apps/api/app/domains/comic/character_reference_packs.py` with:

- `export_character_reference_pack(session, task_id)`
- manifest builder
- safe filename builder
- zip writer
- asset file reader

Add the export route in `apps/api/app/domains/comic/router.py`.

**Step 4: Run export tests to verify GREEN**

Run the same pytest command. Expected: pass.

### Task 2: Backend Import Tests

**Files:**
- Modify: `apps/api/tests/test_comic_character_reference_pack.py`
- Modify: `apps/api/app/domains/comic/character_reference_packs.py`
- Modify: `apps/api/app/domains/comic/router.py`

**Step 1: Write failing import tests**

Add tests proving:

- `POST /api/public/comic/tasks/{task_id}/character-references/import` accepts a zip upload.
- imported images become new `Asset` rows.
- matching `ComicCharacterCard.reference_asset_id` values are updated.
- import rejects missing manifest, missing image, unsafe path, and unmatched character.

**Step 2: Run tests to verify RED**

Run:

```bash
python -c 'import subprocess, sys; result = subprocess.run(["pytest", "-q", "apps/api/tests/test_comic_character_reference_pack.py"], timeout=60); sys.exit(result.returncode)'
```

Expected: new import tests fail because import is not implemented.

**Step 3: Implement minimal import service**

Extend `character_reference_packs.py` with:

- zip parsing
- manifest validation
- archive path validation
- allowed image suffix/MIME validation
- current task card matching by `character_code`, then `name`
- `Asset` persistence through existing asset helpers
- card reference updates

Add the import route in `router.py`.

**Step 4: Run backend tests to verify GREEN**

Run the same pytest command. Expected: pass.

### Task 3: Frontend API Helpers And UI

**Files:**
- Modify: `apps/public-web/src/lib/public-api.ts`
- Modify: `apps/public-web/src/features/comic/comic-studio.tsx`
- Modify: `apps/public-web/src/features/comic/manga-project-panel.tsx`
- Modify: `apps/public-web/src/features/comic/comic-project.module.css`
- Test: `apps/public-web/tests/api-client.test.mjs` or focused helper test

**Step 1: Write failing frontend helper test**

Add focused tests for:

- export helper calls the zip download endpoint.
- import helper sends multipart zip data.

**Step 2: Run frontend test to verify RED**

Run:

```bash
pnpm --filter public-web test -- api-client.test.mjs
```

Expected: fail because helpers do not exist.

**Step 3: Implement helpers and UI wiring**

Add:

- `downloadComicCharacterReferencePack(taskId)`
- `importComicCharacterReferencePack(taskId, file)`
- local UI state for import/export busy/error
- buttons in `MangaProjectPanel`
- latest task id passed from `ComicStudio`

**Step 4: Run frontend tests and typecheck**

Run:

```bash
pnpm --filter public-web test -- api-client.test.mjs
pnpm --filter public-web exec tsc --noEmit
```

Expected: pass.

### Task 4: Focused Integration Verification

**Files:**
- No new files unless tests reveal a defect.

**Step 1: Run focused backend tests**

Run:

```bash
python -c 'import subprocess, sys; result = subprocess.run(["pytest", "-q", "apps/api/tests/test_comic_character_reference_pack.py", "apps/api/tests/test_comic_character_references.py", "apps/api/tests/test_comic_single_reference_sheet.py"], timeout=60); sys.exit(result.returncode)'
```

Expected: pass.

**Step 2: Run frontend checks**

Run:

```bash
pnpm --filter public-web exec tsc --noEmit
```

Expected: pass.

**Step 3: Inspect changed files**

Run:

```bash
git diff -- apps/api/app/domains/comic/character_reference_packs.py apps/api/app/domains/comic/router.py apps/api/tests/test_comic_character_reference_pack.py apps/public-web/src/lib/public-api.ts apps/public-web/src/features/comic/comic-studio.tsx apps/public-web/src/features/comic/manga-project-panel.tsx apps/public-web/src/features/comic/comic-project.module.css
```

Expected: only planned feature changes are present.
