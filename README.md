# image Studio

独立商业化仓库，承接用户生图、钱包计费、激活码、漫画创作、后台运营与外部 LLM Provider 接入。

当前仓库已经具备本地联调骨架、GHCR 镜像构建工作流，以及面向服务器的单一 Docker Compose 镜像部署配置。

## 服务拓扑

- `public-web`：用户端 Next.js，本地直连端口 `7700`，生产仅 Docker 内网可见
- `admin-web`：后台端 Next.js，本地直连端口 `7701`，生产仅 Docker 内网可见
- `api`：FastAPI，本地直连端口 `7800`，生产仅 Docker 内网可见
- `worker`：异步任务进程，负责消费图片任务
- `postgres`：主数据库，生产仅 Docker 内网可见
- `nginx`：统一入口与反向代理，生产默认只暴露 `7700` 与 `7701`

## 仓库结构

- `apps/public-web`：用户端
- `apps/admin-web`：后台端
- `apps/api`：API 服务
- `apps/worker`：任务 Worker
- `packages/types`：共享类型
- `packages/sdk`：共享 SDK
- `packages/ui`：共享 UI
- `db/migrations`：迁移说明
- `db/seeds`：初始化数据说明
- `infra/docker`：容器运行说明
- `infra/nginx`：反向代理说明
- `generated-assets`：生成图片落盘目录

## 端口与访问约定

- `public-web`：`7700`
- `admin-web`：`7701`
- `api`：`7800`
- `postgres`：`5432`
- 生产用户端入口：`7700`
- 生产管理后台入口：`7701`

前端代码内部请求的是相对路径：

- 用户端走 `/api/public/*`
- 后台端走 `/api/admin/*`

因此：

- 纯前端开发时，可以分别打开 `7700`、`7701`
- 需要打通真实 API 时，必须让浏览器流量先经过反向代理，或自行提供等价的本地代理规则
- 本仓库当前推荐使用 `nginx` 作为统一入口

## 环境要求

- Node.js `20+`
- `pnpm 10.8.1`
- Python `3.11+`
- Docker / Docker Compose

## 环境变量

复制唯一模板：

```bash
cp .env.example .env
```

关键变量说明：

- `DATABASE_URL`：API 与 worker 共用数据库连接
- `PUBLIC_WEB_ORIGIN`：用户端对外地址，生产环境必须改为真实域名
- `ADMIN_WEB_ORIGIN`：后台端对外地址，生产环境必须改为真实域名
- `API_BASE_URL`：API 对外地址
- `USER_SESSION_COOKIE_NAME`：用户会话 Cookie 名称
- `ANONYMOUS_SESSION_COOKIE_NAME`：匿名用户 Cookie 名称
- `ANONYMOUS_SESSION_COOKIE_SECURE`：匿名会话 Cookie 是否写入 `Secure` 标记；当前 HTTP 端口部署保持 `false`，启用 HTTPS 后改为 `true`
- `ADMIN_SESSION_COOKIE_NAME`：管理员会话 Cookie 名称
- `ADMIN_SESSION_COOKIE_SECURE`：管理员会话 Cookie 是否写入 `Secure` 标记；当前 HTTP 端口部署保持 `false`，启用 HTTPS 后改为 `true`
- `SESSION_SECRET`：服务端会话相关密钥，生产环境必须替换
- `APP_ENV`：`development` 或 `production`
- `APP_VERSION`：版本号
- `GENERATED_ASSETS_DIR`：图片任务落盘目录
- `OPENAI_PROVIDER_KEY`：OpenAI-compatible provider 使用的 API Key，可按后台 provider 配置里的 `api_key_env` 名称扩展更多密钥
- `DEFAULT_ADMIN_USERNAME`：默认管理员用户名
- `DEFAULT_ADMIN_PASSWORD`：默认管理员密码
- `WORKER_NAME`：worker 进程名
- `WORKER_POLL_INTERVAL_SECONDS`：worker 轮询间隔
- `WORKER_IMAGE_JOB_CONCURRENCY`：worker 并发处理图片任务数量
- `WORKER_STALE_RUNNING_JOB_SECONDS`：判定任务陈旧的阈值
- `WORKER_STALE_JOB_ALERT_THRESHOLD`：触发 worker 告警的最小陈旧任务数

## 默认管理员初始化

默认管理员不是单独的 seed 命令，而是由 API 在启动时自动执行：

1. API 启动后会先执行 Alembic 迁移到 `head`
2. 然后读取 `DEFAULT_ADMIN_USERNAME` 与 `DEFAULT_ADMIN_PASSWORD`
3. 两者都非空时，若数据库中不存在同名管理员，则自动创建
4. 若变量为空，则跳过初始化

这意味着：

- 首次本地启动前，请先在 `.env` 中设置一个可登录的管理员账号
- 生产环境首次部署时，也应在环境变量中提供这两个值
- 同名管理员已存在时，不会重复创建

后台登录接口：

- `POST /api/admin/auth/login`

## generated-assets 挂载说明

`generated-assets` 是 API 与 worker 共享的文件落盘目录，不是前端静态构建目录。

当前代码会将生成结果写入：

- `${GENERATED_ASSETS_DIR}/asset-{id}.svg`
- `${GENERATED_ASSETS_DIR}/uploads/upload-{id}.<ext>`

使用约定：

- 本地裸机运行时，默认使用仓库根目录下的 `./generated-assets`
- Docker 运行时，必须把该目录同时挂载到 `api` 与 `worker`
- 生产环境应挂载到持久化卷；如果切换到对象存储，再调整对应实现
- 公开上传入口使用 `POST /api/public/image/uploads`
- 生产 Nginx 入口显式允许最大 `50MB` 请求体；超过时返回统一 JSON 错误 `payload_too_large`，不返回 HTML 错误页。确需关闭该代理限制时，将 `infra/nginx/nginx.prod.conf` 中的 `client_max_body_size` 改为 `0` 并重载 Nginx。

## 数据库迁移

当前仓库已经接入 Alembic，基线版本为 `20260424_000001`。

常用命令：

```bash
alembic -c alembic.ini upgrade head
alembic -c alembic.ini current
alembic -c alembic.ini history
```

运行时约定：

- `initialize_database()` 会先导入领域模型，再执行 `alembic upgrade head`
- API 与 worker 共用同一套 Alembic 迁移入口
- 新环境与正式部署都以 Alembic 为唯一 schema 真源，不再依赖运行时建表

## 本地运行

### 方案 A：本地进程 + Docker Postgres

1. 安装前端依赖

```bash
pnpm install
```

2. 准备 Python 虚拟环境

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt -r apps/worker/requirements.txt
```

3. 准备环境变量

```bash
cp .env.example .env
```

4. 准备数据库

本地进程联调需要一个可从宿主机访问的 PostgreSQL，并把 `.env` 里的 `DATABASE_URL` 指向它。正式 `docker-compose.yml` 不把数据库端口发布到宿主机。

5. 启动 API

```bash
source .venv/bin/activate
uvicorn apps.api.app.main:app --reload --host 0.0.0.0 --port 7800
```

6. 启动 worker

```bash
source .venv/bin/activate
python -m apps.worker.worker.main
```

7. 启动两个前端

```bash
pnpm dev:public
pnpm dev:admin
```

8. 本地访问

- 用户端：`http://localhost:7700/`
- 后台端：`http://localhost:7701/`
- API 健康检查：`http://localhost:7800/health`

### 方案 B：Docker Compose 镜像部署验证

仓库根目录只保留正式 `docker-compose.yml`，直接拉取 GHCR 镜像运行。

启动：

```bash
docker compose pull
docker compose up -d
```

查看日志：

```bash
docker compose logs -f api worker public-web admin-web nginx
```

停止：

```bash
docker compose down
```

清理数据库卷：

```bash
docker compose down -v
```

## 生产镜像部署

仓库推送到 `main` 或 `v*.*.*` tag 后，`.github/workflows/build-ghcr-images.yml` 会构建并推送 `api`、`worker`、`public-web`、`admin-web` 四个 GHCR 镜像。

服务器首次部署：

```bash
cp .env.example .env
docker login ghcr.io
docker compose pull
docker compose up -d
```

后续部署：

```bash
./scripts/deploy-prod.sh
```

默认访问：

- 用户端：`http://服务器IP:7700/`
- 后台端：`http://服务器IP:7701/`
- API 健康检查：`http://服务器IP:7700/health`

生产 Compose 只对外发布 `7700` 和 `7701`。`public-web:7700`、`admin-web:7701`、`api:7800`、`postgres:5432` 只在 Docker 网络内部给 nginx、API 和 worker 使用。

生产建议见 `infra/docker/README.md`、`infra/nginx/README.md`、`db/migrations/README.md`、`db/seeds/README.md`。

## 最小自检

API 健康检查：

```bash
curl http://localhost:7800/health
```

管理员登录：

```bash
curl -i -X POST http://localhost:7800/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me"}'
```

worker 单次消费：

```bash
source .venv/bin/activate
python -m apps.worker.worker.main --once
```

worker 观测摘要：

```bash
curl -i http://localhost:7800/api/admin/ops/worker-summary
```

## 当前阶段

当前仓库具备可运行 MVP 基线、图片任务 worker 化、provider/model 管理、settings 生效与后台运营草案。
