# Public Shared Quota Design

## 背景

当前项目已经有匿名 session 和服务端 Provider 目录，生图接口也能在未登录、未提交浏览器 Provider 配置时走服务端 Provider。漫画页会自动创建匿名 session，但公开体验没有统一的额度模型，管理端也不能设置公开共享次数。

目标是恢复并明确一条站点公开体验路径：管理员在后台配置 Provider、模型和公开额度；游客打开网站即可体验生图和漫画；登录用户、自带 URL/Key 用户继续保留原有路径。

## 访问模式

公开接口按请求身份分三类：

1. 已登录用户：存在有效 `studio_user_session`，走现有用户钱包和会员价格，不消耗公开额度。
2. 自带 Provider 用户：请求带完整 `x-client-id`、`x-client-provider-base-url`、`x-client-provider-api-key`，走浏览器提交的 Provider 配置，不消耗公开额度。
3. 公开体验用户：未登录且未提交自带 Provider 配置，使用管理员配置的服务端 Provider 和公开模型，消耗公开共享额度。

这三种模式并存，不互相降级，也不做静默 fallback。任何额度不足、Provider 缺失、配置错误都应暴露为明确 API 错误。

## 额度模型

新增独立公共额度域，不复用钱包余额。钱包是登录用户资产；公开额度是站点运营配置，混在一起会让匿名 session、登录迁移和每日刷新变复杂。

公共额度按“创建一次真实工作任务”计数：

- 生图：创建一个 `image_jobs` 记录消耗 1 次公开额度。
- 漫画：创建一个 `comic_tasks` 记录消耗 1 次公开额度。
- 漫画内部自动派生的角色参考图、页面图不会重复消耗公开额度。
- 当前仓库没有独立应用执行域；额度服务预留 `app` feature，后续应用入口调用同一服务即可共享同一池子。

支持两种模式：

- `daily_global`：全站每天共享固定次数，北京时间每日 00:00 切换到新的日期桶。
- `per_ip`：每个 IP 一个固定总次数桶，不按天刷新。

## 数据结构

`site_settings` 增加管理端可配置字段：

- `public_quota_mode`
- `public_quota_daily_global_limit`
- `public_quota_per_ip_limit`

新增 `public_quota_buckets`：

- `quota_mode`
- `quota_key`
- `used_count`
- `limit_count`
- `updated_at`

`daily_global` 的 `quota_key` 为北京时间日期，例如 `2026-04-27`。`per_ip` 的 `quota_key` 为加盐 IP hash，避免存储原始 IP。

新增 `public_quota_usages` 作为审计流水：

- `bucket_id`
- `feature`
- `units`
- `reference_type`
- `reference_id`
- `request_ip_hash`
- `created_at`

## 数据流

公开入口先完成原有 owner 解析和业务校验，创建待执行任务并拿到本地引用 ID，然后调用公共额度服务。额度服务在同一个数据库事务里更新 bucket 并写 usage。若额度不足，抛出 `public_quota_exhausted`，任务和额度流水都不提交。

生图入口接入点：

- `POST /api/public/image/jobs`

漫画入口接入点：

- `POST /api/public/comic/tasks`

`POST /api/public/comic/projects` 不消耗额度，因为它只创建项目容器，不触发 LLM 或图片任务。

## 管理端

管理端设置页增加公开额度配置：

- 模式选择：每日全站共享 / 每 IP 固定次数
- 每日全站额度输入
- 每 IP 额度输入

保存仍走 `/api/admin/settings`。公共设置接口也返回这些字段，便于前端之后展示公开体验状态。

## 错误处理

额度不足返回：

- code: `public_quota_exhausted`
- status: `403`

额度配置非法返回：

- code: `public_quota_invalid`
- status: `422`

IP 无法解析返回：

- code: `public_quota_ip_unavailable`
- status: `422`

这些错误不被吞掉，不转成假成功。

## 验证

后端用 pytest 覆盖：

- 匿名生图消耗每日全站公开额度。
- 匿名漫画任务与生图共用同一个每日全站额度。
- 自带 Provider 请求不消耗公开额度。
- 登录用户请求不消耗公开额度。
- 每 IP 模式按 IP hash 分桶并限制次数。
- 每日全站模式按北京时间日期刷新。

前端用 TypeScript 构建验证管理端字段和表单提交类型。
