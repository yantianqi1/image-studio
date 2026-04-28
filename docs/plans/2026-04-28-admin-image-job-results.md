# Admin Image Job Results Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let administrators expand image generation jobs and inspect prompts, result images, revised prompts, and provider metadata.

**Architecture:** Extend the existing image domain admin API with batch-loaded result rows and an admin-only asset route. Update the admin image jobs page to render expandable task-log cards without changing public ownership checks.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, Next.js 16, React 19, TypeScript, Tailwind CSS utilities.

---

### Task 1: Backend Admin Results Payload

**Files:**
- Modify: `apps/api/tests/test_image_jobs.py`
- Modify: `apps/api/app/domains/image/repository.py`
- Modify: `apps/api/app/domains/image/routes.py`

**Step 1: Write the failing test**

Add a test that seeds an admin, creates a user image job, processes it, logs in as admin, and asserts `/api/admin/image/jobs` returns `results` with one result whose `asset_url` starts with `/api/admin/image/assets/`.

**Step 2: Run test to verify it fails**

Run:

```bash
python3.13 -c "import subprocess, sys; result = subprocess.run(['pytest', '-q', 'apps/api/tests/test_image_jobs.py::test_admin_image_jobs_include_results'], timeout=60); sys.exit(result.returncode)"
```

Expected: fail because `results` is missing from the admin job payload.

**Step 3: Write minimal implementation**

- Add `list_results_for_jobs(session, job_ids)` returning a dict keyed by job id.
- Update admin route to fetch jobs once and pass batch results into the payload builder.
- Add an admin result payload helper that rewrites `asset_url` to `/api/admin/image/assets/{asset_id}`.

**Step 4: Run test to verify it passes**

Run the same targeted pytest command. Expected: pass.

### Task 2: Backend Admin Asset Route

**Files:**
- Modify: `apps/api/tests/test_image_jobs.py`
- Modify: `apps/api/app/domains/image/routes.py`

**Step 1: Write the failing test**

Add a test that creates a generated image as a user, logs in as admin, then requests `/api/admin/image/assets/{asset_id}` and verifies the image content is returned.

**Step 2: Run test to verify it fails**

Run:

```bash
python3.13 -c "import subprocess, sys; result = subprocess.run(['pytest', '-q', 'apps/api/tests/test_image_jobs.py::test_admin_can_read_any_image_job_result_asset'], timeout=60); sys.exit(result.returncode)"
```

Expected: fail with 404 because the route does not exist.

**Step 3: Write minimal implementation**

Add `@admin_router.get('/image/assets/{asset_id}')`, call `require_admin`, load the asset with `get_asset`, and return `FileResponse`.

**Step 4: Run test to verify it passes**

Run the same targeted pytest command. Expected: pass.

### Task 3: Admin UI Expandable Job Log

**Files:**
- Modify: `apps/admin-web/src/lib/admin-api.ts`
- Modify: `apps/admin-web/src/features/jobs/image-jobs-page.tsx`

**Step 1: Update API types**

Add admin image job/result types in `admin-api.ts`, including `results`, `asset_url`, `revised_prompt`, and `provider_request_id`.

**Step 2: Update UI**

Refactor `ImageJobsPage` into small helpers: status pill, job card, prompt block, result grid. Keep each function under 50 lines.

**Step 3: Verify TypeScript**

Run:

```bash
pnpm typecheck:admin
```

Expected: no TypeScript errors.

### Task 4: Full Verification

**Files:**
- No code changes expected.

**Step 1: Run backend image tests**

Run:

```bash
python3.13 -c "import subprocess, sys; result = subprocess.run(['pytest', '-q', 'apps/api/tests/test_image_jobs.py'], timeout=60); sys.exit(result.returncode)"
```

Expected: all tests pass.

**Step 2: Build admin frontend**

Run:

```bash
pnpm build:admin
```

Expected: production build succeeds.
