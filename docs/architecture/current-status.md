# image Studio Current Status

更新日期：2026-05-19

## 当前定位

`commercial-studio` 现在的边界是：

- 后端只负责接入 NewAPI、中转模型、拉取模型目录、执行任务和记录资产/观测
- 本地不再承载 wallet、billing、redeem、pricing 闭环
- 用户计费归 NewAPI / 总站层处理
- 管理后台保留用户、模型、任务、设置和运营观测

## 已完成内容

### 仓库与工程基础

- `public-web` / `admin-web` / `api` / `worker`
- `packages/types` / `packages/sdk`
- API / 前端 / worker 的基础运行和构建链路

### 后端领域

- `auth`
- `llm`
- `image`
- `comic`
- `settings`
- `audit`
- `ops`
- `worker claim / execute / retry` 最小闭环
- `NewAPI` 模型同步与模型执行接入

### 用户端页面

- 公开生图页
- 登录 / 账户页
- 漫画页
- 任务页

### 后台页面

- 登录页
- 用户页
- Provider / 模型页
- 图片任务页
- 漫画任务页
- 设置页

## 当前验证结果

最近已确认通过的验证包括：

- 后端单文件 pytest
- admin-web 静态测试
- public-web 相关静态测试
- typecheck / build 系列验证

## 仍在关注的事项

- 更强的 worker 并发与告警观测
- provider 失败分析和运营可见性
- 继续清理历史文档里残留的本地 billing 叙述
