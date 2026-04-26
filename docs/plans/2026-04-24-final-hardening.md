# Final Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐正式迁移体系、任务观测/告警可见性，以及 `site_title`/上传域的最后收口。

**Architecture:** 数据库进入 Alembic 管理，API/worker 启动从“直接 create_all”切换到“优先 migrate，再兼容本地开发 patch”。任务观测先提供真实后端摘要接口与后台页展示，不引入伪告警。站点标题通过 public/admin settings 读取进入 layout metadata；上传域补最小上传接口、资产记录和 settings 约束。

**Tech Stack:** Alembic, SQLAlchemy, FastAPI, pytest, Next.js app router, multipart upload

---

### Task 1: Alembic Baseline

**Files:**
- Create: `alembic.ini`
- Create: `apps/api/alembic/env.py`
- Create: `apps/api/alembic/script.py.mako`
- Create: `apps/api/alembic/versions/20260424_000001_baseline.py`
- Modify: `apps/api/app/infra/db/session.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/worker/worker/main.py`
- Modify: `apps/api/requirements.txt`

**Step 1: Write the failing test**

补测试验证：
- Alembic upgrade 可在空库创建完整 schema
- 运行后不再依赖 `create_all()` 才能通过核心接口测试

**Step 2: Run test to verify it fails**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_migrations.py -q ... PY`
Expected: FAIL

**Step 3: Write minimal implementation**

实现：
- Alembic 配置
- baseline migration
- `initialize_database()` 改为 migrate-first

**Step 4: Run test to verify it passes**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_migrations.py -q ... PY`
Expected: PASS

### Task 2: Worker Observability

**Files:**
- Modify: `apps/worker/worker/config.py`
- Modify: `apps/worker/worker/main.py`
- Modify: `apps/api/app/domains/image/service.py`
- Create: `apps/api/app/domains/ops/routes.py`
- Test: `apps/api/tests/test_worker_observability.py`

**Step 1: Write the failing test**

补测试覆盖：
- API 返回 worker summary / stuck job summary
- summary 只基于真实 DB 状态，不伪造告警

**Step 2: Run test to verify it fails**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_worker_observability.py -q ... PY`
Expected: FAIL

**Step 3: Write minimal implementation**

实现：
- worker config 增加 stale/alert 阈值
- ops summary route
- admin dashboard 可消费真实摘要

**Step 4: Run test to verify it passes**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_worker_observability.py -q ... PY`
Expected: PASS

### Task 3: Site Title + Upload Domain

**Files:**
- Modify: `apps/public-web/src/app/layout.tsx`
- Modify: `apps/admin-web/src/app/layout.tsx`
- Modify: `apps/api/app/domains/image/routes.py`
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `apps/api/tests/test_settings_admin_ops.py`
- Create: `apps/api/tests/test_uploads.py`

**Step 1: Write the failing test**

补测试覆盖：
- `site_title` 可通过 settings 影响布局 metadata 来源
- `uploads_enabled=false` 时上传接口显式拒绝
- `uploads_enabled=true` 时可上传并生成真实 asset 记录

**Step 2: Run test to verify it fails**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_settings_admin_ops.py apps/api/tests/test_uploads.py -q ... PY`
Expected: FAIL

**Step 3: Write minimal implementation**

实现：
- public/admin layout 走动态 settings
- 最小上传接口 `/api/public/image/uploads`
- 上传文件写入 `generated-assets/uploads`

**Step 4: Run test to verify it passes**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_settings_admin_ops.py apps/api/tests/test_uploads.py -q ... PY`
Expected: PASS

### Task 4: Full Verification + Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/current-status.md`
- Modify: `docs/architecture/master-plan.md`
- Modify: `db/migrations/README.md`

**Step 1: Update docs**

写清：
- Alembic 使用方式
- worker summary 入口
- 上传接口与 settings 关系

**Step 2: Run verification**

Run: `python3 - <<'PY' ... pytest apps/api/tests -q ... PY`
Expected: PASS

Run: `pnpm typecheck:packages && pnpm typecheck:public && pnpm typecheck:admin`
Expected: PASS

Run: `pnpm build:public && pnpm build:admin`
Expected: PASS

Run: `python3 -m apps.worker.worker.main --once`
Expected: exit 0
