# Commercial Studio

独立商业化仓库，承接用户生图、钱包计费、激活码、漫画创作、后台运营与外部 LLM Provider 接入。

## 仓库结构

- `apps/public-web`：用户端 Next.js
- `apps/admin-web`：后台端 Next.js
- `apps/api`：FastAPI API
- `apps/worker`：异步任务进程
- `packages/types`：共享类型
- `packages/sdk`：前端 API SDK
- `packages/ui`：共享 UI 壳层组件
- `db/migrations`：数据库迁移
- `docs/architecture`：架构说明
- `docs/plans`：执行计划

## 端口约定

- `public-web`：`7700`
- `admin-web`：`7701`
- `api`：`7800`

## 本地启动

### 1. 前端依赖

```bash
pnpm install
```

### 2. PostgreSQL

```bash
docker compose up -d postgres
```

### 3. 前端

```bash
pnpm dev:public
pnpm dev:admin
```

### 4. Python 环境

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt -r apps/worker/requirements.txt
```

### 5. API 与 Worker

```bash
uvicorn apps.api.app.main:app --reload --port 7800
python -m apps.worker.worker.main
```

## 当前阶段

当前已进入 `M0`：新仓库骨架与统一契约落地。

