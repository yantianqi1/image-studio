# Comic Character Reference Consistency Backend A Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add storage and renderer propagation for multiple reference assets on image jobs.

**Architecture:** Introduce `image_job_reference_assets` as a join table from image jobs to assets, ordered by sequence. The image worker loads these references during processing and passes them into the image renderer without silently dropping unsupported cases.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, pytest, OpenAI-compatible image adapter.

---

### Task 1: Add Multi-Reference Image Job Storage

**Files:**
- Create: `apps/api/alembic/versions/20260426_000005_image_job_reference_assets.py`
- Modify: `apps/api/app/domains/image/models.py`
- Modify: `apps/api/app/domains/image/service.py`
- Test: `apps/api/tests/test_migrations.py`
- Test: `apps/api/tests/test_image_jobs.py`

**Step 1: Write the failing migration test**

Add assertions to `apps/api/tests/test_migrations.py`:

```python
assert inspector.has_table("image_job_reference_assets")
reference_columns = {column["name"] for column in inspector.get_columns("image_job_reference_assets")}
assert {"id", "job_id", "asset_id", "sequence", "created_at"}.issubset(reference_columns)
```

Also assert the expected indexes and foreign keys if the existing migration test pattern already checks those.

**Step 2: Run test to verify it fails**

Run:

```bash
python3 -m pytest apps/api/tests/test_migrations.py -q
```

Expected: FAIL because `image_job_reference_assets` does not exist.

**Step 3: Add SQLAlchemy model**

In `apps/api/app/domains/image/models.py`, add:

```python
class ImageJobReferenceAsset(Base):
    __tablename__ = "image_job_reference_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("image_jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
```

Keep model responsibility narrow: it only stores reference attachment metadata. Do not add provider-specific behavior here.

**Step 4: Add Alembic migration**

Create `apps/api/alembic/versions/20260426_000005_image_job_reference_assets.py`.

Migration requirements:

- `revision = "20260426_000005"`
- `down_revision = "20260425_000004"`
- Create table `image_job_reference_assets`.
- Add FK to `image_jobs.id` with `ON DELETE CASCADE`.
- Add FK to `assets.id` with `ON DELETE CASCADE`.
- Add indexes on `job_id` and `asset_id`.
- Add unique constraint on `(job_id, asset_id)`.

**Step 5: Extend image job creation API**

Change `create_job` in `apps/api/app/domains/image/service.py` to accept keyword-only:

```python
reference_asset_ids: list[int] | None = None
```

Validation rules:

- Treat `None` and `[]` as no references.
- Do not mutate the caller-provided list.
- Validate every asset exists.
- Validate `asset.owner_user_id in {None, user_id}`.
- Preserve order and store sequence starting at 1.
- Raise `AppError(code="reference_asset_not_found", status_code=404)` for missing assets.
- Raise `AppError(code="reference_asset_forbidden", status_code=403)` for ownership mismatch.

**Step 6: Add image service tests**

Add tests in `apps/api/tests/test_image_jobs.py`:

```python
def test_create_job_stores_reference_assets_in_order(): ...
def test_create_job_rejects_missing_reference_asset(): ...
def test_create_job_rejects_forbidden_reference_asset(): ...
```

Expected data checks:

- Two rows exist for one job.
- Sequences are `[1, 2]`.
- Asset IDs match input order.

**Step 7: Run focused tests**

Run:

```bash
python3 -m pytest apps/api/tests/test_migrations.py apps/api/tests/test_image_jobs.py -q
```

Expected: PASS.

---

### Task 2: Pass Reference Assets to Image Adapter

**Files:**
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `apps/api/app/domains/llm/service.py`
- Modify: `apps/api/app/domains/llm/openai_image.py`
- Test: `apps/api/tests/test_image_jobs.py`
- Test: `apps/api/tests/test_provider_catalog.py`

**Step 1: Write the failing renderer propagation test**

Add a test that creates:

- two `Asset` rows,
- one `ImageJob` with `reference_asset_ids=[asset_a.id, asset_b.id]`,
- a monkeypatched renderer spy.

The test should run the worker processing path and assert:

```python
assert render_calls[0]["reference_asset_ids"] == [asset_a.id, asset_b.id]
```

**Step 2: Run test to verify it fails**

Run:

```bash
python3 -m pytest apps/api/tests/test_image_jobs.py::test_image_job_passes_reference_assets_to_renderer -q
```

Expected: FAIL because the current worker does not load or pass reference IDs.

**Step 3: Load reference rows during image processing**

In `process_render_results`, query `ImageJobReferenceAsset` rows:

```python
reference_asset_ids = list(
    session.execute(
        select(ImageJobReferenceAsset.asset_id)
        .where(ImageJobReferenceAsset.job_id == job.id)
        .order_by(ImageJobReferenceAsset.sequence.asc())
    ).scalars()
)
```

Pass them into `render_options` only when non-empty:

```python
if reference_asset_ids:
    render_options["reference_asset_ids"] = reference_asset_ids
```

**Step 4: Extend renderer service signature**

Update `apps/api/app/domains/llm/service.py` so `render_image` accepts:

```python
reference_asset_ids: list[int] | None = None
```

Rules:

- Never silently ignore non-empty references.
- Keep `source_asset_id` behavior unchanged.
- Pass references to provider adapter as an immutable copied list.

**Step 5: Extend OpenAI-compatible image adapter**

Update `apps/api/app/domains/llm/openai_image.py`.

Provider behavior requirements:

- If the provider endpoint supports multiple image inputs, attach all reference assets.
- If current adapter cannot support multiple references safely, raise:

```python
AppError(
    code="provider_reference_assets_unsupported",
    message="provider image adapter does not support reference assets",
    status_code=422,
)
```

Do not degrade to prompt-only generation.

**Step 6: Add unsupported-provider test if needed**

If the adapter cannot yet send multiple images, add a test asserting explicit failure for non-empty `reference_asset_ids`.

This is acceptable because it exposes a real provider limitation instead of pretending consistency is enforced.

**Step 7: Run focused tests**

Run:

```bash
python3 -m pytest apps/api/tests/test_image_jobs.py apps/api/tests/test_provider_catalog.py -q
```

Expected: PASS.
