# image Studio Master Plan

## 目标

`commercial-studio` 是独立的商业化影像工作台，职责是：

- 用户注册、登录、会话
- 任务创建、执行、结果、资产和观测
- 外部模型接入与目录同步
- 漫画创作工作流
- 管理后台运营视图

## 当前边界

- 本仓库不承载本地钱包、扣费、账本、兑换码或价格矩阵
- 计费边界放在 NewAPI / 总站层
- 本仓库只保留模型同步、模型调用、任务状态和资产记录

## 运行时

- `public-web`：端口 `7700`
- `admin-web`：端口 `7701`
- `api`：端口 `7800`
- `worker`：异步任务进程

## 领域边界

- `auth`
- `llm`
- `image`
- `comic`
- `assets`
- `settings`
- `audit`
- `ops`

## 基础约束

- 金额和计费不在本仓库闭环
- 前后端统一返回 `{ data, meta, error }`
- 用户态与后台态使用独立 cookie
- 长任务统一进 `worker`
- Provider 调用必须经过统一抽象

## 当前开发方向

1. 保持 NewAPI 模型同步和执行链路稳定
2. 继续提升 worker 可靠性和任务观测
3. 完善 admin 运营页面的可见性和操作密度
