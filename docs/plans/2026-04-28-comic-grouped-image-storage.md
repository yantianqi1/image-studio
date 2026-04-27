# Comic Grouped Image Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store each comic creation's generated reference images and page images under one project-title task folder.

**Architecture:** Keep the existing `image_jobs` renderer and asset model. Add an optional storage subdirectory to image jobs, then have comic orchestration pass `comics/<project-title--task-id>/references` or `pages` when it creates jobs.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite/Alembic-style initialized schema, pytest.

---

### Task 1: Test Comic Storage Folder

**Files:**
- Modify: `apps/api/tests/test_comic_reference_e2e.py`

**Step 1: Write the failing test**

Add assertions to the full comic generation e2e test that reference and page asset files exist under:

`generated-assets/comics/River-Blade--<task_id>/references`

and:

`generated-assets/comics/River-Blade--<task_id>/pages`

**Step 2: Run test to verify it fails**

Run: `pytest -q apps/api/tests/test_comic_reference_e2e.py::test_worker_persists_full_comic_generation_without_frontend_approval`

Expected: fail because assets still save at the root generated assets directory.

### Task 2: Add Optional Image Job Storage Subdirectory

**Files:**
- Modify: `apps/api/app/domains/image/models.py`
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `apps/api/app/domains/image/assets.py`
- Modify: `apps/api/app/infra/db/bootstrap.py` if schema creation requires model metadata only.

**Step 1: Add the minimal field**

Add `storage_subdir` to `ImageJob` and thread it through `create_job()` / `build_image_job()`.

**Step 2: Save rendered assets under subdirectory**

When `storage_subdir` exists, `persist_rendered_asset()` writes to `storage_dir / storage_subdir / asset-{asset.id}.svg`. Normal jobs keep writing to `storage_dir / asset-{asset.id}.svg`.

**Step 3: Run focused image tests**

Run: `pytest -q apps/api/tests/test_image_jobs.py`

Expected: pass with unchanged normal image behavior.

### Task 3: Add Comic Storage Helper

**Files:**
- Create: `apps/api/app/domains/comic/storage.py`
- Modify: `apps/api/app/domains/comic/pipeline.py`
- Modify: `apps/api/app/domains/comic/character_references.py`
- Modify: `apps/api/app/domains/comic/image_generation.py`

**Step 1: Build stable folder names**

Create helpers to sanitize the project title and return:

`comics/<safe-project-title>--<task_id>/references`

or:

`comics/<safe-project-title>--<task_id>/pages`

**Step 2: Persist folder name**

Add `asset_folder_name` to comic task output when the pipeline completes.

**Step 3: Pass subdirectories to image jobs**

Reference jobs use the `references` subdir. Page jobs use the `pages` subdir.

### Task 4: Verify

**Files:**
- Test only.

**Step 1: Run focused tests**

Run: `pytest -q apps/api/tests/test_comic_reference_e2e.py apps/api/tests/test_comic_image_generation.py apps/api/tests/test_image_jobs.py`

Expected: pass.
