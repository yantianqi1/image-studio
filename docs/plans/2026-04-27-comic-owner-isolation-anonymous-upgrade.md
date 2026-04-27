# Comic Owner Isolation & Anonymous Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 登录用户和匿名浏览器都拥有独立数据边界，匿名作品在注册/登录后自动归入账号，形象图和成品图继续保存在服务器。

**Architecture:** 后端以 owner 作为唯一权限来源：登录态用 `user_id`，匿名态用服务端签发的 `anonymous_session_id`。前端只保存展示缓存和自用供应商配置，权限凭证走 HttpOnly cookie；项目、任务、图片任务和资产都绑定 owner，所有读写、导出、图片访问都强制校验；匿名升级为登录时只迁移数据库 owner，不复制文件。

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest, FastAPI TestClient, Next.js/React, TypeScript.

---

## Guardrails

- 不用 `localStorage` 做权限凭证；匿名权限凭证必须是服务端 cookie。
- 不把自用 provider API Key 当身份；它只服务供应商调用。
- 不能只过滤列表；详情、删除、导入导出、图片读取都要校验 owner。
- 越权返回 404 优先，避免泄露资源存在性。
- worker 不依赖请求 cookie，只读取任务里已持久化的 owner/provider 配置。

---

### Task 1: 匿名会话与 owner 字段

**Files:**
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/domains/auth/models.py`
- Modify: `apps/api/app/domains/image/models.py`
- Modify: `apps/api/app/domains/comic/models.py`
- Modify: `apps/api/app/infra/db/bootstrap.py`
- Create: `apps/api/app/domains/auth/anonymous_sessions.py`
- Create: `apps/api/alembic/versions/20260427_000007_owner_isolation_anonymous_sessions.py`
- Test: `apps/api/tests/test_auth_anonymous_sessions.py`

**Failing test:** 首次匿名访问 `/api/public/auth/anonymous-session` 签发 `studio_anonymous_session`；后续请求复用同一个匿名 session；数据库只保存 token hash。

**Run to fail:**

```bash
pytest -q apps/api/tests/test_auth_anonymous_sessions.py -v --maxfail=1
```

**Implementation:**
- 新增 `AnonymousSession(id, token_hash, created_at, revoked_at, rotated_from_id)`。
- `AppSettings` 增加 `anonymous_session_cookie_name` 和 `anonymous_session_max_age_seconds`。
- 给 `ComicProject`、`ComicTask`、`ImageJob`、`Asset` 增加 `owner_user_id/user_id` 与 `owner_anonymous_session_id/anonymous_session_id`。
- migration 新增匿名 session 表、owner 字段、索引、外键；历史无 owner 数据不进入 public owner 查询。

**Run to pass:**

```bash
pytest -q apps/api/tests/test_auth_anonymous_sessions.py -v --maxfail=1
```

---

### Task 2: 统一 owner 解析

**Files:**
- Modify: `apps/api/app/domains/auth/service.py`
- Modify: `apps/api/app/domains/auth/routes.py`
- Create: `apps/api/app/domains/auth/ownership.py`
- Modify: `apps/api/app/domains/llm/client_provider.py`
- Test: `apps/api/tests/test_auth_owner_resolution.py`

**Failing test:** 登录用户优先于匿名；匿名 cookie 可解析 owner；失效匿名 cookie 不可访问旧数据；自用 provider header 不再承担身份权限。

**Run to fail:**

```bash
pytest -q apps/api/tests/test_auth_owner_resolution.py -v --maxfail=1
```

**Implementation:**

```python
@dataclass(frozen=True)
class OwnerContext:
    user_id: int | None
    anonymous_session_id: int | None
```

- 实现 `resolve_request_owner(request, session)`。
- 实现 `ensure_anonymous_owner(request, response, session)`。
- 登录 cookie 有效时返回 `user_id`；否则返回有效匿名 session。
- `client_provider` 只保留供应商配置职责，不作为权限来源。

**Run to pass:**

```bash
pytest -q apps/api/tests/test_auth_owner_resolution.py -v --maxfail=1
```

---

### Task 3: 漫创与图片接口强隔离

**Files:**
- Modify: `apps/api/app/domains/comic/repository.py`
- Modify: `apps/api/app/domains/comic/services.py`
- Modify: `apps/api/app/domains/comic/router.py`
- Modify: `apps/api/app/domains/comic/image_generation.py`
- Modify: `apps/api/app/domains/comic/character_references.py`
- Modify: `apps/api/app/domains/comic/character_reference_pack_import.py`
- Modify: `apps/api/app/domains/image/assets.py`
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `apps/api/app/domains/image/routes.py`
- Test: `apps/api/tests/test_comic_owner_isolation.py`
- Test: `apps/api/tests/test_image_asset_owner_isolation.py`

**Failing test:** 用户 A 不能访问用户 B 的 project/task/asset；匿名 A 不能访问匿名 B；`/image/assets/{asset_id}`、`/image/jobs/{job_id}`、`/image/jobs/{job_id}/results` 都拒绝跨 owner；admin 仍能全量查看。

**Run to fail:**

```bash
pytest -q apps/api/tests/test_comic_owner_isolation.py apps/api/tests/test_image_asset_owner_isolation.py -v --maxfail=1
```

**Implementation:**
- repository 新增 `list_projects_for_owner()`、`get_project_for_owner()`、`list_tasks_for_owner()`、`get_task_for_owner()`。
- service 新增 `require_project_owner()`、`require_task_owner()`、`require_image_job_owner()`、`require_asset_owner()`。
- 路由入口统一解析 owner，并传入 service。
- `persist_rendered_asset()`、`persist_uploaded_asset()` 写入 owner。
- 人设图、成品图、导入图包继承 task owner。

**Run to pass:**

```bash
pytest -q apps/api/tests/test_comic_owner_isolation.py apps/api/tests/test_image_asset_owner_isolation.py -v --maxfail=1
```

---

### Task 4: 匿名注册/登录后自动接管数据

**Files:**
- Modify: `apps/api/app/domains/auth/routes.py`
- Modify: `apps/api/app/domains/auth/service.py`
- Create: `apps/api/app/domains/auth/ownership_migration.py`
- Test: `apps/api/tests/test_anonymous_to_login_upgrade.py`

**Failing test:** 匿名创建项目、任务、上传/生成资产；随后注册或登录；旧数据迁移到 `user_id`；匿名 cookie 被撤销；登录态可访问，旧匿名态不可访问。

**Run to fail:**

```bash
pytest -q apps/api/tests/test_anonymous_to_login_upgrade.py -v --maxfail=1
```

**Implementation:**
- 实现 `migrate_anonymous_owner_to_user(session, anonymous_session_id, user_id)`。
- 原地更新 `comic_projects`、`comic_tasks`、`image_jobs`、`assets` 的 owner。
- 清空 anonymous owner 字段并 revoke anonymous session。
- 注册和登录成功后，在同一事务内执行迁移，再写登录 cookie。

**Run to pass:**

```bash
pytest -q apps/api/tests/test_anonymous_to_login_upgrade.py -v --maxfail=1
```

---

### Task 5: 前端匿名身份与登录刷新

**Files:**
- Modify: `apps/public-web/src/lib/api-client.ts`
- Modify: `apps/public-web/src/lib/public-api.ts`
- Modify: `apps/public-web/src/features/auth/login-panel.tsx`
- Modify: `apps/public-web/src/features/comic/comic-studio.tsx`
- Modify: `apps/public-web/src/features/comic/comic-studio-helpers.ts`
- Create: `apps/public-web/src/features/comic/comic-anonymous-session.ts`
- Test: `apps/public-web/tests/comic-anonymous-upgrade.test.mjs`

**Failing test:** 未登录进入 `/comic` 初始化匿名 session；匿名作品可见；登录成功后刷新当前 owner 数据；不渲染其他身份数据。

**Run to fail:**

```bash
pnpm --filter public-web test -- --runInBand apps/public-web/tests/comic-anonymous-upgrade.test.mjs
```

**Implementation:**
- 新增 `ensureComicAnonymousSession()` 调 `/auth/anonymous-session`。
- `/comic` 首次加载先确保匿名/登录 owner 可用，再拉项目和任务。
- 登录/注册成功后清理本地匿名展示态，重新拉 `/comic/projects`、`/comic/tasks`。
- `client-provider-config.ts` 继续只存供应商配置和 clientId，不作为权限。

**Run to pass:**

```bash
pnpm --filter public-web test -- --runInBand apps/public-web/tests/comic-anonymous-upgrade.test.mjs
```

---

### Task 6: 回归与验收

**Files:**
- Modify: `apps/api/tests/test_auth_billing_redeem.py`
- Modify: `apps/api/tests/test_uploads.py`
- Modify: `apps/api/tests/test_comic_domain.py`
- Modify: `apps/api/tests/test_comic_reference_e2e.py`
- Modify: `apps/api/tests/test_comic_image_generation.py`

**Regression assertions:** 登录、钱包、上传、worker、漫创人设、成品图、导出/导入都在 owner 隔离后仍可用。

**Backend verification:**

```bash
pytest -q apps/api/tests/test_auth_billing_redeem.py apps/api/tests/test_uploads.py apps/api/tests/test_comic_domain.py apps/api/tests/test_comic_reference_e2e.py apps/api/tests/test_comic_image_generation.py apps/api/tests/test_auth_anonymous_sessions.py apps/api/tests/test_auth_owner_resolution.py apps/api/tests/test_comic_owner_isolation.py apps/api/tests/test_image_asset_owner_isolation.py apps/api/tests/test_anonymous_to_login_upgrade.py -v --maxfail=1
```

**Frontend verification:**

```bash
pnpm --filter public-web test
pnpm --filter public-web typecheck
```

**Acceptance:**
- 用户 A 看不到用户 B 的项目、任务、图片。
- 匿名 A 看不到匿名 B 的项目、任务、图片。
- 匿名注册/登录后，旧项目和图片归入账号。
- 图片仍由 API 从服务器 `generated-assets` 返回。
- 无接口把 provider API Key 或 `localStorage` 当权限凭证。

