# Commercial Studio Current Status

更新日期：2026-04-24

## 当前进度

当前仓库已经从“空骨架”推进到“可运行 MVP 基线”。

### 完成度判断

- 架构骨架：完成
- 后端主域：大部分完成
- 用户端页面：完成最小可运行版
- 后台页面：完成最小可运行版
- 部署收尾：大部分完成
- 生产级加固：未完成

整体状态更接近：

- `MVP 已成型`
- `仍未达到生产 100%`

## 已完成内容

### 仓库与工程基础

- 新仓库：`/Volumes/Fanxiang S500Pro/项目/commercial-studio`
- `pnpm workspace`
- `public-web` / `admin-web` / `api` / `worker`
- `packages/types` / `packages/sdk` / `packages/ui`

### 后端领域

- `auth`
- `billing`
- `redeem`
- `llm`
- `image`
- `comic`
- `settings`
- `worker claim / execute / retry` 最小闭环
- `openai-compatible provider` 最小闭环
- `sellable model pricing` 后台闭环
- `admin billing ledger / adjustment` 最小闭环

### 用户端页面

- 公开生图页
- 登录页
- 钱包页
- 漫画页
- 任务页

### 后台页面

- 登录页
- 用户页
- 钱包查询页
- 激活码页
- Provider 页
- 图片任务页
- 漫画任务页
- 设置页

## 当前验证结果

最近一轮已确认通过：

- `pytest apps/api/tests -q`
- `pnpm typecheck:packages`
- `pnpm typecheck:public`
- `pnpm typecheck:admin`
- `pnpm build:public`
- `pnpm build:admin`
- `docker compose --env-file .env.example config`
- `python -m apps.worker.worker.main --once`

## 当前仍未完成的部分

### 生产级任务系统

目前图片任务已经从“API 路由内同步执行”推进到“API 入队 + worker claim 执行 + retry”：

- `worker` 可独立启动
- `image job` 已具备 claim / execute / retry / stale recovery / terminal failure 最小闭环
- 失败不会静默吞掉，错误信息会如实落库

当前仍未补齐：

- 多 worker 抢占下的更强并发控制
- 更细粒度的任务观测与告警策略

### Provider 能力

当前已经具备：

- `local-dev` provider
- `openai-compatible` provider 配置与调用
- `sellable model -> provider -> upstream model` 的绑定链路
- 图片任务入队时会固定 provider 快照

当前仍建议继续补：

- provider update / rotate 的更完整后台流程
- 多 provider 观测与失败分析

### 设置与运营深度

设置域和后台运营页已经不只是“可读写最小配置”，而是补到了首版可运营闭环：

- `allow_public_signup` 已在注册入口生效
- `allow_anonymous_image` 已在匿名生图入口生效
- `uploads_enabled` 已在 `mode=edit` 入口生效
- 后台可维护 provider 和 sellable model 价格
- 后台可查询钱包、查看 ledger、执行手工调账

当前仍未完全补齐：

- `site_title` 已覆盖 public/admin layout metadata
- 独立上传入口 `/api/public/image/uploads` 已落地
- 更细的上传大小/类型限制仍未落地

### 部署收尾

目前已经补上：

- `alembic.ini`
- `apps/api/alembic/*`
- `.env.example`
- `docker-compose.yml`
- `infra/docker/README.md`
- `infra/nginx/README.md`
- `db/migrations/README.md`
- `db/seeds/README.md`

当前仍需补：

- 更严格的生产运维脚本
- 多 worker 并发下的更强任务控制

## 下一步建议执行顺序

1. 继续补多 worker 并发控制
2. 继续补 provider 观测与失败分析
3. 把生产运维脚本补到更严格的发布态
