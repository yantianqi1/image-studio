# Public Shared Quota Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real shared public quota for anonymous site usage across image generation, comic creation, and future app execution.

**Architecture:** Store quota configuration on `site_settings`, keep usage state in a separate `public_quota` domain, and consume quota only at public entrypoints. Logged-in requests and client-provider requests bypass public quota; anonymous server-provider requests consume one shared unit per created work task.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, Next.js admin UI, TypeScript.

---

### Task 1: Public Quota Backend Model

**Files:**
- Create: `apps/api/app/domains/public_quota/models.py`
- Create: `apps/api/app/domains/public_quota/__init__.py`
- Modify: `apps/api/app/infra/db/bootstrap.py`
- Modify: `apps/api/app/domains/settings/models.py`
- Modify: `apps/api/app/domains/settings/schemas.py`
- Modify: `apps/api/app/domains/settings/service.py`
- Create: `apps/api/alembic/versions/20260427_000008_public_shared_quota.py`
- Test: `apps/api/tests/test_public_quota.py`

**Steps:**

1. Write failing pytest coverage for default quota fields returned by `/api/admin/settings`.
2. Run `timeout 60s pytest -q apps/api/tests/test_public_quota.py::test_admin_settings_exposes_public_quota_fields`.
3. Add settings fields and quota models.
4. Add Alembic migration.
5. Import public quota models in bootstrap.
6. Run the test again and confirm it passes.

### Task 2: Public Quota Consumption Service

**Files:**
- Create: `apps/api/app/domains/public_quota/service.py`
- Test: `apps/api/tests/test_public_quota.py`

**Steps:**

1. Write failing tests for daily global consumption, per-IP consumption, bypass decisions, and Beijing date buckets.
2. Run `timeout 60s pytest -q apps/api/tests/test_public_quota.py`.
3. Implement `consume_public_quota()` with explicit errors and hashed IP keys.
4. Use atomic bucket update with `used_count + units <= limit_count`.
5. Run `timeout 60s pytest -q apps/api/tests/test_public_quota.py`.

### Task 3: Public Entry Point Integration

**Files:**
- Modify: `apps/api/app/domains/image/routes.py`
- Modify: `apps/api/app/domains/comic/router.py`
- Modify: `apps/api/app/domains/comic/services.py`
- Test: `apps/api/tests/test_public_quota.py`
- Test: `apps/api/tests/test_image_jobs.py`
- Test: `apps/api/tests/test_comic_owner_isolation.py`

**Steps:**

1. Write failing tests proving anonymous image and comic task share the same daily quota.
2. Write failing tests proving logged-in and client-provider requests bypass public quota.
3. Make `comic.services.create_task()` support router-managed commit for quota atomicity.
4. Consume quota after image job or comic task is flushed but before route commit.
5. Run targeted backend tests with `timeout 60s`.

### Task 4: Admin Settings UI

**Files:**
- Modify: `apps/admin-web/src/lib/admin-api.ts`
- Modify: `apps/admin-web/src/features/settings/settings-page.tsx`
- Modify: `apps/public-web/src/lib/public-api.ts`

**Steps:**

1. Extend admin API types with quota fields.
2. Add mode selector and numeric quota inputs to settings page.
3. Preserve existing public signup, anonymous image, and upload controls.
4. Extend public settings type with quota fields.
5. Run `pnpm --filter admin-web typecheck`.

### Task 5: Verification

**Files:**
- All touched files.

**Steps:**

1. Run `timeout 60s pytest -q apps/api/tests/test_public_quota.py`.
2. Run `timeout 60s pytest -q apps/api/tests/test_settings_admin_ops.py apps/api/tests/test_image_jobs.py apps/api/tests/test_comic_owner_isolation.py`.
3. Run `pnpm --filter admin-web typecheck`.
4. Run any formatter or typecheck the project already exposes if targeted checks reveal drift.
