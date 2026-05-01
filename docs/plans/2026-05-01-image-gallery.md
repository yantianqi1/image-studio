# Image Gallery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a database-backed image gallery where generated images are saved privately by default and can be published during or after generation.

**Architecture:** Store visibility on `assets`, because assets are the shareable image objects. Keep `image_jobs` as execution records and query gallery items by joining `Asset`, `ImageJobResult`, and `ImageJob`. The public web app gets a new `/gallery` route with mine/public scopes and a responsive masonry layout.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, Next.js App Router, React, TypeScript, CSS modules, Node test runner.

---

### Task 1: Asset Visibility Schema

**Files:**
- Modify: `apps/api/app/domains/image/models.py`
- Create: `apps/api/alembic/versions/20260501_000011_asset_visibility.py`
- Modify: `apps/api/tests/test_migrations.py`

**Step 1: Write the failing migration test**

Update `HEAD_REVISION`:

```python
HEAD_REVISION = "20260501_000011"
```

Add to `test_alembic_upgrade_creates_core_tables`:

```python
asset_columns = {column["name"] for column in inspector.get_columns("assets")}
assert {"owner_user_id", "owner_anonymous_session_id", "visibility", "published_at"} <= asset_columns
asset_indexes = {index["name"] for index in inspector.get_indexes("assets")}
assert "ix_assets_visibility" in asset_indexes
```

**Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest apps/api/tests/test_migrations.py -q
```

Expected: FAIL because `visibility`, `published_at`, and `ix_assets_visibility` do not exist.

**Step 3: Implement schema**

In `Asset`, add:

```python
visibility: Mapped[str] = mapped_column(String(16), default="private", nullable=False, index=True)
published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
```

Create Alembic revision:

```python
"""asset visibility

Revision ID: 20260501_000011
Revises: 20260428_000010
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260501_000011"
down_revision = "20260428_000010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.add_column(sa.Column("visibility", sa.String(length=16), nullable=False, server_default="private"))
        batch_op.add_column(sa.Column("published_at", sa.DateTime(), nullable=True))
        batch_op.create_index("ix_assets_visibility", ["visibility"])
    with op.batch_alter_table("assets") as batch_op:
        batch_op.alter_column("visibility", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("assets") as batch_op:
        batch_op.drop_index("ix_assets_visibility")
        batch_op.drop_column("published_at")
        batch_op.drop_column("visibility")
```

**Step 4: Run test to verify it passes**

Run:

```bash
python -m pytest apps/api/tests/test_migrations.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/app/domains/image/models.py apps/api/alembic/versions/20260501_000011_asset_visibility.py apps/api/tests/test_migrations.py
git commit -m "feat(api): add asset visibility schema"
```

### Task 2: Backend Gallery Domain

**Files:**
- Modify: `apps/api/app/domains/image/repository.py`
- Modify: `apps/api/app/domains/image/schemas.py`
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `apps/api/app/domains/image/routes.py`
- Test: `apps/api/tests/test_image_gallery.py`

**Step 1: Write failing tests**

Create `apps/api/tests/test_image_gallery.py` with tests for:

```python
def test_image_job_defaults_to_private_visibility(monkeypatch): ...
def test_public_image_job_publishes_rendered_asset(monkeypatch): ...
def test_gallery_mine_lists_only_owner_assets(monkeypatch): ...
def test_gallery_public_lists_only_public_assets(monkeypatch): ...
def test_visibility_toggle_requires_asset_owner(monkeypatch): ...
def test_public_asset_file_can_be_read_by_non_owner(monkeypatch): ...
```

Use helpers from `test_image_asset_owner_isolation.py`: register two users, monkeypatch `image_service.render_image`, run `worker_image_jobs.run_next_image_job()`, then assert responses through `/api/public/image/gallery` and `/api/public/image/assets/{asset_id}`.

**Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest apps/api/tests/test_image_gallery.py -q
```

Expected: FAIL because gallery endpoints and visibility fields are missing.

**Step 3: Implement validation and persistence**

In `schemas.py`, add:

```python
class UpdateAssetVisibilityRequest(BaseModel):
    visibility: str = Field(default="private", pattern="^(private|public)$")
```

Extend `CreateImageJobRequest` with the same `visibility` field.

Add constants and helpers in `repository.py`:

```python
ASSET_VISIBILITY_PRIVATE = "private"
ASSET_VISIBILITY_PUBLIC = "public"

def set_asset_visibility(asset: Asset, visibility: str) -> None:
    if visibility not in {ASSET_VISIBILITY_PRIVATE, ASSET_VISIBILITY_PUBLIC}:
        raise AppError(code="asset_visibility_invalid", message="asset visibility invalid", status_code=422)
    asset.visibility = visibility
    asset.published_at = datetime.utcnow() if visibility == ASSET_VISIBILITY_PUBLIC else None
```

Add gallery query helpers that join `ImageJobResult`, `ImageJob`, and `Asset`, filtering by owner for `mine` and by `Asset.visibility == "public"` for `public`.

Store `visibility` on `ImageJob` only if needed for worker inheritance, or pass it through process time by adding `visibility` to `ImageJob` if the implementation needs persistence before completion. If adding to `ImageJob`, add a small migration and tests in this task.

**Step 4: Implement routes**

Add:

- `GET /image/gallery`
- `PATCH /image/assets/{asset_id}/visibility`

Update `get_image_asset` so public assets are readable without owner match while private assets keep existing owner isolation.

**Step 5: Run tests to verify they pass**

Run:

```bash
python -m pytest apps/api/tests/test_image_gallery.py apps/api/tests/test_image_asset_owner_isolation.py apps/api/tests/test_image_jobs.py -q
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/api/app/domains/image apps/api/tests/test_image_gallery.py
git commit -m "feat(api): add image gallery visibility"
```

### Task 3: Public API Client and Navigation

**Files:**
- Modify: `apps/public-web/src/lib/public-api.ts`
- Modify: `apps/public-web/src/features/shell/app-navigation.ts`
- Test: `apps/public-web/tests/public-api-gallery.test.mjs`
- Test: `apps/public-web/tests/app-navigation.test.mjs`

**Step 1: Write failing frontend tests**

Create `public-api-gallery.test.mjs` that loads `public-api.ts` and asserts:

```js
await publicApi.getImageGallery("mine");
assert.deepEqual(calls, ["/image/gallery?scope=mine"]);
await publicApi.updateImageAssetVisibility(12, "public");
assert.equal(calls[1].path, "/image/assets/12/visibility");
assert.equal(calls[1].body.visibility, "public");
```

Update `app-navigation.test.mjs` to expect a `图库` item and `grid-cols-7`.

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter public-web test
```

Expected: FAIL on missing APIs and navigation item.

**Step 3: Implement API types**

Add:

```ts
export type ImageAssetVisibility = "private" | "public";
export type ImageGalleryScope = "mine" | "public";
export type ImageGalleryItem = Readonly<{
  asset_id: number;
  asset_url: string;
  visibility: ImageAssetVisibility;
  published_at: string | null;
  created_at: string;
  job_id: number;
  result_index: number;
  prompt: string;
  revised_prompt: string | null;
}>;
```

Extend `ImageGenerationRequest` with `visibility?: ImageAssetVisibility`.

Add `getImageGallery(scope)` and `updateImageAssetVisibility(assetId, visibility)`.

**Step 4: Update navigation**

Insert `{ href: "/gallery", label: "图库" }` after `生图`; change desktop/mobile grids to seven columns and update tests.

**Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter public-web test
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/public-web/src/lib/public-api.ts apps/public-web/src/features/shell/app-navigation.ts apps/public-web/tests
git commit -m "feat(public-web): expose gallery api and navigation"
```

### Task 4: Generation Visibility Controls

**Files:**
- Modify: `apps/public-web/src/features/home/generation-workbench.types.ts`
- Modify: `apps/public-web/src/features/home/generation-control-panel.tsx`
- Modify: `apps/public-web/src/features/home/generation-workbench.tsx`
- Modify: `apps/public-web/src/features/home/generation-result-panel.tsx`
- Test: `apps/public-web/tests/generation-control-panel.test.mjs`
- Test: `apps/public-web/tests/generation-result-panel-gallery.test.mjs`

**Step 1: Write failing tests**

Assert source contains:

```js
assert.match(controlSource, /私有保存/);
assert.match(controlSource, /公开展示/);
assert.match(workbenchSource, /visibility: form.visibility/);
assert.match(resultSource, /updateImageAssetVisibility/);
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter public-web test
```

Expected: FAIL on missing controls and update call.

**Step 3: Implement controls**

Add `visibility` to the generation form state, default `private`. In the control panel, render a compact segmented control. Submit `visibility` with `publicApi.generateImage`.

In result cards, when `image.assetId` exists, render a visibility toggle that calls `publicApi.updateImageAssetVisibility`.

**Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter public-web test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/public-web/src/features/home apps/public-web/tests
git commit -m "feat(public-web): publish generated images"
```

### Task 5: Gallery Page UI

**Files:**
- Create: `apps/public-web/src/app/gallery/page.tsx`
- Create: `apps/public-web/src/features/gallery/gallery-page.tsx`
- Create: `apps/public-web/src/features/gallery/gallery-masonry.tsx`
- Create: `apps/public-web/src/features/gallery/gallery-page.module.css`
- Test: `apps/public-web/tests/gallery-page.test.mjs`

**Step 1: Write failing tests**

Assert:

```js
assert.match(pageSource, /GalleryPage/);
assert.match(gallerySource, /activeHref="\/gallery"/);
assert.match(gallerySource, /publicApi\.getImageGallery/);
assert.match(masonrySource, /useOrderedGalleryColumns/);
assert.match(stylesSource, /galleryGrid/);
```

**Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter public-web test
```

Expected: FAIL because the gallery route and components do not exist.

**Step 3: Implement page**

Build:

- `GalleryPage` client component using `useApiResource`.
- Scope state: `mine` or `public`.
- Toolbar segmented control.
- `GalleryMasonry` with stable index-based columns and responsive CSS.
- Image tiles using plain `<img>` for API asset URLs.
- Reuse `ImagePreviewDialog` for full-screen image preview.
- Explicit loading, error, empty states via existing `StatusCard` and `ErrorMessage`.

Keep each file under 300 lines and helper functions under 50 lines.

**Step 4: Run tests and typecheck**

Run:

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/public-web/src/app/gallery apps/public-web/src/features/gallery apps/public-web/tests/gallery-page.test.mjs
git commit -m "feat(public-web): add image gallery page"
```

### Task 6: Final Verification

**Files:**
- No new files unless fixes are needed.

**Step 1: Run backend focused tests**

Run:

```bash
python -m pytest apps/api/tests/test_migrations.py apps/api/tests/test_image_gallery.py apps/api/tests/test_image_asset_owner_isolation.py apps/api/tests/test_image_jobs.py -q
```

Expected: PASS within 60 seconds.

**Step 2: Run frontend checks**

Run:

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

Expected: PASS.

**Step 3: Review status**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing untracked generated assets remain.

**Step 4: Commit final fixes if any**

```bash
git add <changed files>
git commit -m "fix: stabilize image gallery"
```
