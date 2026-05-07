# GCS Asset Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all image-gallery assets, uploads, thumbnails, and reference-image reads to Google Cloud Storage without changing the public API URL contract.

**Architecture:** Add a storage abstraction in `apps/api/app/infra/storage` and make the image domain depend on that interface instead of direct `Path(...)` access. Keep the public API as the only read gate, keep bucket access private, and migrate existing local files into GCS with a one-time explicit script. No dual-write, no silent fallback.

**Tech Stack:** FastAPI, SQLAlchemy, Pillow, `google-cloud-storage`, pytest

---

### Task 1: Add storage settings and storage backends

**Files:**
- Modify: `apps/api/app/core/config.py`
- Create: `apps/api/app/infra/storage/__init__.py`
- Create: `apps/api/app/infra/storage/asset_storage.py`
- Create: `apps/api/app/infra/storage/local_asset_storage.py`
- Create: `apps/api/app/infra/storage/gcs_asset_storage.py`
- Create: `apps/api/app/infra/storage/factory.py`
- Create: `apps/api/tests/test_asset_storage.py`

**Step 1: Write the failing test**

Create `apps/api/tests/test_asset_storage.py` with three checks:

```python
def test_settings_expose_asset_storage_config():
    settings = get_settings()
    assert settings.asset_storage_backend == "local"
    assert settings.asset_storage_gcs_bucket == ""
    assert settings.asset_storage_gcs_prefix == "generated-assets"


def test_local_backend_round_trips_bytes(tmp_path):
    storage = LocalAssetStorage(root=tmp_path)
    storage.write_bytes("uploads/upload-1.png", b"demo-bytes", "image/png")
    assert storage.read_bytes("uploads/upload-1.png") == b"demo-bytes"


def test_gcs_backend_uses_client_objects(monkeypatch):
    # fake bucket/blob objects should capture object key, bytes, and content-type
    ...
```

**Step 2: Run the test and confirm it fails**

Run:

```bash
timeout 60s pytest apps/api/tests/test_asset_storage.py -q
```

Expected: fail because the settings fields and storage modules do not exist yet.

**Step 3: Write the minimal implementation**

Implement:

- `AssetStorage` protocol or abstract base with `write_bytes`, `read_bytes`, `delete`, `exists`, `open_read`
- `LocalAssetStorage` backed by `GENERATED_ASSETS_DIR`
- `GcsAssetStorage` backed by `google.cloud.storage.Client`
- `build_asset_storage(settings)` factory that selects backend by config
- new settings fields in `AppSettings`

Keep key handling backend-agnostic. The database will store canonical keys, not absolute local paths.

**Step 4: Run the test and confirm it passes**

Run:

```bash
timeout 60s pytest apps/api/tests/test_asset_storage.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/app/core/config.py apps/api/app/infra/storage apps/api/tests/test_asset_storage.py
git commit -m "feat: add asset storage backends"
```

### Task 2: Rewrite image asset persistence, reads, thumbnails, and deletion

**Files:**
- Modify: `apps/api/app/domains/image/assets.py`
- Modify: `apps/api/app/domains/image/routes.py`
- Modify: `apps/api/app/domains/image/repository.py`
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `apps/api/tests/test_image_gallery.py`
- Modify: `apps/api/tests/test_uploads.py`

**Step 1: Write the failing test**

Add or update tests so they assert:

- uploaded assets still return `asset_url`, but no code depends on a local filesystem path
- `GET /api/public/image/assets/{id}` and `/thumbnail` work through the storage backend
- deleting a job removes both the original asset key and the thumbnail key
- thumbnail generation still returns a 640px bounding box JPEG

Use the existing test client fixtures and a fake storage backend injected through the app/session wiring.

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
timeout 60s pytest apps/api/tests/test_image_gallery.py apps/api/tests/test_uploads.py -q
```

Expected: fail on direct `Path(asset.storage_path)` access and missing storage abstraction.

**Step 3: Write the minimal implementation**

Refactor the image domain so:

- `persist_rendered_asset` and `persist_uploaded_asset` call the storage backend
- `resolve_thumbnail_file` becomes storage-backed and writes the derived thumbnail key
- `get_image_asset` and `get_admin_image_asset` read bytes from storage instead of using `FileResponse(Path(...))`
- `clear_job_outputs` deletes storage objects before removing `Asset` rows
- `storage_path` is persisted as a canonical key like `uploads/upload-1.png`

Do not keep a fallback path to local files once the backend is GCS.

**Step 4: Run the targeted tests and confirm they pass**

Run:

```bash
timeout 60s pytest apps/api/tests/test_image_gallery.py apps/api/tests/test_uploads.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/app/domains/image/assets.py apps/api/app/domains/image/routes.py apps/api/app/domains/image/repository.py apps/api/app/domains/image/service.py apps/api/tests/test_image_gallery.py apps/api/tests/test_uploads.py
git commit -m "feat: route image assets through storage backend"
```

### Task 3: Update provider reference-image readers to use storage bytes

**Files:**
- Modify: `apps/api/app/domains/llm/openai_image.py`
- Modify: `apps/api/app/domains/llm/openai_chat_image.py`
- Modify: `apps/api/tests/test_openai_chat_image.py`
- Modify: `apps/api/tests/test_image_jobs.py`

**Step 1: Write the failing test**

Add tests that prove:

- reference images are read through the storage backend, not `Path(asset.storage_path).read_bytes()`
- OpenAI-compatible edit requests still send multipart image data correctly
- chat-image requests still embed reference bytes into the payload

Use monkeypatched storage reads or a fake asset storage to make the failure explicit.

**Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
timeout 60s pytest apps/api/tests/test_openai_chat_image.py apps/api/tests/test_image_jobs.py -q
```

Expected: fail because provider code still hard-codes local file access.

**Step 3: Write the minimal implementation**

Change both provider modules so they load image bytes from the storage abstraction before building request payloads. Keep the provider request/response logic unchanged.

**Step 4: Run the targeted tests and confirm they pass**

Run:

```bash
timeout 60s pytest apps/api/tests/test_openai_chat_image.py apps/api/tests/test_image_jobs.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/app/domains/llm/openai_image.py apps/api/app/domains/llm/openai_chat_image.py apps/api/tests/test_openai_chat_image.py apps/api/tests/test_image_jobs.py
git commit -m "feat: read provider images from storage backend"
```

### Task 4: Add the GCS migration script and deployment configuration

**Files:**
- Create: `apps/api/app/domains/image/storage_migration.py`
- Modify: `apps/api/requirements.txt`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `apps/api/tests/test_migrations.py`

**Step 1: Write the failing test**

Add a migration-focused test that seeds a few asset rows with local files, runs the migration helper against a fake GCS backend, and asserts:

- each object is uploaded exactly once
- each row is rewritten to the canonical key
- missing source files raise an explicit error

**Step 2: Run the targeted test and confirm it fails**

Run:

```bash
timeout 60s pytest apps/api/tests/test_migrations.py -q
```

Expected: fail because the migration helper does not exist yet.

**Step 3: Write the minimal implementation**

Implement a standalone migration helper that:

- scans `assets` rows
- reads the current local file
- uploads it to the configured GCS bucket and prefix
- rewrites `storage_path` to the canonical key
- stops on the first missing or unreadable file

Add config/env/docs for:

- `ASSET_STORAGE_BACKEND`
- `ASSET_STORAGE_GCS_BUCKET`
- `ASSET_STORAGE_GCS_PREFIX`

Add `google-cloud-storage` to the shared Python requirements so both API and worker images can import it.

**Step 4: Run the targeted test and confirm it passes**

Run:

```bash
timeout 60s pytest apps/api/tests/test_migrations.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/app/domains/image/storage_migration.py apps/api/requirements.txt .env.example docker-compose.yml README.md apps/api/tests/test_migrations.py
git commit -m "feat: add gcs asset migration tooling"
```

### Task 5: Sweep the remaining asset-path tests and run the full backend suite

**Files:**
- Modify: `apps/api/tests/test_anonymous_to_login_upgrade.py`
- Modify: `apps/api/tests/test_image_asset_owner_isolation.py`
- Modify: `apps/api/tests/test_comic_character_reference_pack.py`
- Modify: `apps/api/tests/test_comic_character_reference_pack_single_sheet.py`
- Modify: `apps/api/tests/test_comic_image_generation.py`
- Modify: `apps/api/tests/test_comic_reference_e2e.py`
- Modify: `apps/api/tests/test_provider_catalog.py`
- Modify: `apps/api/tests/test_comic_single_reference_sheet.py`

**Step 1: Write the failing test**

Update the assertions in the listed tests so they stop assuming `Path(asset.storage_path)` is a local filesystem path. Replace those checks with storage-backed reads, URL checks, or direct byte comparisons.

**Step 2: Run the relevant tests and confirm they fail**

Run:

```bash
timeout 60s pytest \
  apps/api/tests/test_anonymous_to_login_upgrade.py \
  apps/api/tests/test_image_asset_owner_isolation.py \
  apps/api/tests/test_comic_character_reference_pack.py \
  apps/api/tests/test_comic_character_reference_pack_single_sheet.py \
  apps/api/tests/test_comic_image_generation.py \
  apps/api/tests/test_comic_reference_e2e.py \
  apps/api/tests/test_provider_catalog.py \
  apps/api/tests/test_comic_single_reference_sheet.py \
  -q
```

Expected: fail until the new storage abstraction is wired through every caller.

**Step 3: Write the minimal implementation**

Update the remaining asset-path callers and assertions so all image-related flows use the storage backend and the existing API URLs.

**Step 4: Run the full backend suite**

Run:

```bash
timeout 60s pytest apps/api/tests -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/tests/test_anonymous_to_login_upgrade.py apps/api/tests/test_image_asset_owner_isolation.py apps/api/tests/test_comic_character_reference_pack.py apps/api/tests/test_comic_character_reference_pack_single_sheet.py apps/api/tests/test_comic_image_generation.py apps/api/tests/test_comic_reference_e2e.py apps/api/tests/test_provider_catalog.py apps/api/tests/test_comic_single_reference_sheet.py
git commit -m "test: update asset path assertions for gcs storage"
```
