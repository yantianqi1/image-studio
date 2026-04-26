# Production Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐 commercial-studio 的 provider、运营配置、后台定价/账务和部署收尾，让仓库从 MVP 基线推进到可交付生产草案。

**Architecture:** 继续沿用现有领域边界。`llm` 域负责 provider 与 sellable model 抽象，`image` 域只依赖统一 render adapter；`settings` 域负责运行期开关并在 public routes 生效；`billing` 域补管理侧查询能力；部署层通过 compose/nginx/env 文档收尾。

**Tech Stack:** FastAPI, SQLAlchemy, httpx, pytest, Next.js admin-web, pnpm, docker-compose

---

### Task 1: OpenAI-Compatible Provider Backend

**Files:**
- Modify: `apps/api/app/domains/llm/models.py`
- Modify: `apps/api/app/domains/llm/service.py`
- Modify: `apps/api/app/domains/llm/routes.py`
- Modify: `apps/api/app/domains/image/service.py`
- Test: `apps/api/tests/test_image_jobs.py`

**Step 1: Write the failing test**

补测试覆盖：
- `openai-compatible` provider 创建校验
- sellable model 绑定 provider 后，图片任务通过统一 adapter 调用
- provider 配置缺失 / inactive / env key 缺失时显式失败

**Step 2: Run test to verify it fails**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_image_jobs.py -q ... PY`
Expected: FAIL

**Step 3: Write minimal implementation**

实现：
- provider 配置字段
- sellable model 与 provider 绑定
- `render_image(session, prompt, model_code)` 统一分派
- OpenAI-compatible image generation adapter

**Step 4: Run test to verify it passes**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_image_jobs.py -q ... PY`
Expected: PASS

### Task 2: Settings Enforcement + Pricing/Admin Billing

**Files:**
- Modify: `apps/api/app/domains/settings/service.py`
- Modify: `apps/api/app/domains/auth/routes.py`
- Modify: `apps/api/app/domains/image/routes.py`
- Modify: `apps/api/app/domains/billing/routes.py`
- Modify: `apps/api/app/domains/llm/routes.py`
- Modify: `apps/admin-web/src/lib/admin-api.ts`
- Modify: `apps/admin-web/src/features/providers/providers-page.tsx`
- Modify: `apps/admin-web/src/features/settings/settings-page.tsx`
- Modify: `apps/admin-web/src/features/billing/billing-page.tsx`
- Test: `apps/api/tests/test_auth_billing_redeem.py`

**Step 1: Write the failing test**

补测试覆盖：
- 禁用公开注册后 `/api/public/auth/register` 返回显式错误
- 禁用匿名生图后匿名调用 `/api/public/image/jobs` 返回显式错误
- admin 能读取钱包账本
- admin 能创建/更新 sellable models 价格与公开开关

**Step 2: Run test to verify it fails**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_auth_billing_redeem.py apps/api/tests/test_image_jobs.py -q ... PY`
Expected: FAIL

**Step 3: Write minimal implementation**

实现：
- settings 在 public routes 实际生效
- admin wallet ledger 查询
- admin model pricing 管理 API
- admin-web 对 provider / pricing / billing 的最小操作界面

**Step 4: Run test to verify it passes**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_auth_billing_redeem.py apps/api/tests/test_image_jobs.py -q ... PY`
Expected: PASS

### Task 3: Worker Hardening

**Files:**
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `apps/worker/worker/config.py`
- Test: `apps/api/tests/test_image_jobs.py`

**Step 1: Write the failing test**

补测试覆盖：
- stale running job 会被重新入队或在超过尝试上限后终态失败

**Step 2: Run test to verify it fails**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_image_jobs.py -q ... PY`
Expected: FAIL

**Step 3: Write minimal implementation**

实现：
- stale running recovery
- worker timeout 相关配置

**Step 4: Run test to verify it passes**

Run: `python3 - <<'PY' ... pytest apps/api/tests/test_image_jobs.py -q ... PY`
Expected: PASS

### Task 4: Deploy/Docs Finish

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docker-compose.yml`
- Modify: `infra/docker/README.md`
- Modify: `infra/nginx/README.md`
- Modify: `db/migrations/README.md`
- Modify: `db/seeds/README.md`
- Modify: `docs/architecture/current-status.md`
- Modify: `docs/architecture/master-plan.md`

**Step 1: Update docs and runtime assets**

写清：
- 本地启动
- 生产 compose/nginx 草案
- 默认管理员初始化
- provider 环境变量
- 资产目录挂载

**Step 2: Run verification**

Run: `python3 - <<'PY' ... pytest apps/api/tests -q ... PY`
Expected: PASS

Run: `pnpm typecheck:packages && pnpm typecheck:public && pnpm typecheck:admin`
Expected: PASS

Run: `python3 -m apps.worker.worker.main --once`
Expected: exit 0
