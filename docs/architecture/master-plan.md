# Commercial Studio Master Plan

## 目标

新仓库独立承接商业化闭环：

- 用户注册、登录、会话
- 钱包、冻结、扣费、账本
- 激活码生成与兑换
- 公开生图用户端
- 漫画创作工作台
- 后台运营界面
- 外部 LLM Provider 接入

## 运行时

- `public-web`：Next.js，端口 `7700`
- `admin-web`：Next.js，端口 `7701`
- `api`：FastAPI，端口 `7800`
- `worker`：异步任务进程
- `postgres`：主数据库

## 领域边界

- `auth`
- `billing`
- `redeem`
- `pricing`
- `llm`
- `image`
- `comic`
- `assets`
- `settings`

## 基础约束

- 金额统一使用 `cents`
- 前后端统一返回 `{ data, meta, error }`
- 用户态与后台态使用独立 cookie
- 长任务统一进 `worker`
- Provider 调用必须经过统一抽象，不允许业务域直连供应商

## 当前执行顺序

1. 新仓库骨架
2. Auth + Billing + Redeem
3. Provider + Image Job
4. Comic Core
5. Admin Ops
6. Production Hardening

