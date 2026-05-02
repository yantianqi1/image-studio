# Admin Panel Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the admin panel compact, clearly categorized, and make user management usable for searching, inspecting, and operating on real user records.

**Architecture:** Consolidate admin routing under `/admin/*`, expose API failures clearly, and move user management to a paginated admin contract. Rebuild the shell as dense operational UI; user details compose the existing wallet and ledger APIs.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, Next.js 16, React 19, TypeScript, Tailwind CSS utilities, Playwright E2E.

---

## Batches

- Batch 0: backend user tests and API. Main agent only.
- Batch 1: route cleanup, Next proxy, shell/layout. Can split after Batch 0 review.
- Batch 2: user page rebuild and E2E. Start after Batch 1 review.

---

### Task 1: Backend User Contract Tests

**Files:**
- Create: `apps/api/tests/test_admin_users.py`

**Steps:**
1. Add tests for unauthenticated `GET /api/admin/users` returning `401` and `{"error": "Unauthorized"}`.
2. Add an authenticated test for `GET /api/admin/users?page=1&page_size=2`.
3. Assert response data has `items`, `total`, `page`, `page_size`.
4. Assert each item has `id`, `email`, `display_name`, `status`, `created_at`.
5. Add tests for `q=`, `status=`, and invalid pagination returning `422`.
6. Run:

```bash
python3.13 -c "import subprocess, sys; result = subprocess.run(['pytest', '-q', 'apps/api/tests/test_admin_users.py'], timeout=60); sys.exit(result.returncode)"
```

Expected: FAIL because the current endpoint returns a plain array.

---

### Task 2: Backend User API

**Files:**
- Modify: `apps/api/app/domains/auth/routes.py`
- Modify: `apps/api/app/domains/auth/service.py`
- Modify: `apps/api/app/domains/auth/schemas.py`

**Steps:**
1. Add `AdminUserListOptions` with `q`, `status`, `page >= 1`, and `1 <= page_size <= 100`.
2. Keep canonical route `GET /api/admin/users`.
3. Return `{"items": users, "total": total, "page": page, "page_size": page_size}`.
4. Include `created_at` in `user_payload`.
5. Apply search and status filters through SQLAlchemy expressions only.
6. Keep `/api/admin/auth/users` only as explicit compatibility if existing tests require it.
7. Run:

```bash
python3.13 -c "import subprocess, sys; result = subprocess.run(['pytest', '-q', 'apps/api/tests/test_admin_users.py', 'apps/api/tests/test_auth_billing_redeem.py::test_admin_api_without_session_returns_unauthorized_json'], timeout=60); sys.exit(result.returncode)"
```

Expected: PASS.

---

### Task 3: Canonical Admin Routes

**Files:**
- Modify: `apps/admin-web/next.config.ts`
- Modify: `apps/admin-web/src/app/page.tsx`
- Delete: `apps/admin-web/src/app/login/page.tsx`
- Delete: `apps/admin-web/src/app/users/page.tsx`
- Delete: `apps/admin-web/src/app/billing/page.tsx`
- Delete: `apps/admin-web/src/app/redeem/page.tsx`
- Delete: `apps/admin-web/src/app/providers/page.tsx`
- Delete: `apps/admin-web/src/app/image-jobs/page.tsx`
- Delete: `apps/admin-web/src/app/image-tasks/page.tsx`
- Delete: `apps/admin-web/src/app/comic-jobs/page.tsx`
- Delete: `apps/admin-web/src/app/comic-tasks/page.tsx`
- Delete: `apps/admin-web/src/app/settings/page.tsx`

**Steps:**
1. Add explicit redirects from `/`, `/login`, `/users`, `/billing`, `/redeem`, `/providers`, `/image-jobs`, `/image-tasks`, `/comic-jobs`, `/comic-tasks`, and `/settings` to matching `/admin/*` paths.
2. Keep only `/admin/*` page files as real admin routes.
3. Ensure shell links point only to `/admin/*`.
4. Run:

```bash
pnpm typecheck:admin
```

Expected: PASS.

---

### Task 4: Next 16 Proxy Migration

**Files:**
- Create: `apps/admin-web/src/proxy.ts`
- Delete: `apps/admin-web/src/middleware.ts`

**Steps:**
1. Move current auth redirect logic to `proxy.ts`.
2. Rename `middleware(request)` to `proxy(request)`.
3. Protect only `/admin` and `/admin/*`.
4. Ignore `/_next/*`, `/api/*`, favicon, and metadata image assets.
5. Run:

```bash
pnpm dev:admin
```

Expected: fixed port `7701` starts without the middleware deprecation warning. Stop it after checking.

---

### Task 5: Shared Shell And Dense Layout

**Files:**
- Modify: `apps/admin-web/src/features/shell/admin-shell.tsx`
- Create: `apps/admin-web/src/features/shell/admin-nav.tsx`
- Modify: `apps/admin-web/src/features/shell/admin-logout-button.tsx`
- Modify: `apps/admin-web/src/app/globals.css`
- Create: `apps/admin-web/src/features/ui/status-pill.tsx`
- Create: `apps/admin-web/src/features/ui/empty-state.tsx`
- Create: `apps/admin-web/src/features/ui/page-toolbar.tsx`

**Steps:**
1. Add grouped nav: Overview; Users & Money; Models & Work; System.
2. Use `usePathname()` only in `admin-nav.tsx`.
3. Replace large hero with compact title, description, and optional actions.
4. Remove hover lift from structural panels.
5. Keep cards only for repeated items, modals, or framed tools.
6. Set sidebar near `236px`, panel radius `8px`, stable row heights, and horizontal-scroll mobile nav.
7. Run:

```bash
pnpm typecheck:admin
pnpm lint:admin
```

Expected: PASS with no new warnings.

---

### Task 6: Overview Redesign

**Files:**
- Modify: `apps/admin-web/src/features/overview/admin-overview-page.tsx`

**Steps:**
1. Replace decorative app covers with a dense grouped overview.
2. Add operational shortcuts row.
3. Match overview sections to sidebar taxonomy.
4. Ensure a normal desktop viewport shows all primary admin areas without scrolling.
5. Run:

```bash
pnpm typecheck:admin
```

Expected: PASS.

---

### Task 7: User Management Page

**Files:**
- Modify: `apps/admin-web/src/lib/admin-api.ts`
- Modify: `apps/admin-web/src/features/users/users-page.tsx`
- Modify: `apps/admin-web/src/app/globals.css`

**Steps:**
1. Change `adminApi.users()` to call `/api/admin/users`.
2. Accept query `{ q?: string; status?: string; page?: number; pageSize?: number }`.
3. Return `{ items, total, page, page_size }`.
4. Add search, status filter, refresh, result count, loading, empty, error, table rows, and pagination.
5. On row click, open a detail drawer.
6. In the drawer, fetch wallet and ledger through existing admin APIs.
7. Show drawer API errors explicitly.
8. Split helpers: `UsersToolbar`, `UsersTable`, `UserDetailDrawer`, `UserWalletPanel`, `UserLedgerList`, `PaginationControls`.
9. Keep each function under 50 lines.
10. Run:

```bash
pnpm typecheck:admin
pnpm lint:admin
```

Expected: PASS with no new warnings.

---

### Task 8: E2E And Final Verification

**Files:**
- Modify: `tests/e2e/connectivity_e2e.py`

**Steps:**
1. Change admin E2E paths to `/admin/login`, `/admin/users`, `/admin/billing`, `/admin/redeem`, `/admin/providers`, `/admin/settings`, `/admin/image-jobs`, and `/admin/comic-jobs`.
2. Assert user search finds the E2E email.
3. Assert result count is visible.
4. Assert opening a user row reveals wallet or ledger content.
5. Run backend tests:

```bash
python3.13 -c "import subprocess, sys; result = subprocess.run(['pytest', '-q', 'apps/api/tests/test_admin_users.py', 'apps/api/tests/test_auth_billing_redeem.py', 'apps/api/tests/test_settings_admin_ops.py'], timeout=60); sys.exit(result.returncode)"
```

6. Run frontend checks:

```bash
pnpm typecheck:admin
pnpm lint:admin
pnpm build:admin
```

7. Run E2E:

```bash
python3 tests/e2e/connectivity_e2e.py
```

Expected: all commands PASS. Resolve the existing `<img>` lint warning or document it outside this refactor.

---

## Completion Criteria

- Admin UI has one canonical `/admin/*` route tree.
- Sidebar is grouped, compact, and highlights the active route.
- User management supports search, status filter, pagination, loading, empty, error, and detail states.
- User detail can inspect wallet and ledger without manually switching to billing.
- API failures stay explicit; no mock success, silent fallback, or swallowed errors are introduced.
- Backend tests, admin typecheck/lint/build, and E2E pass.
