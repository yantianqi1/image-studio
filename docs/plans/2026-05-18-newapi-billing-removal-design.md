# NewAPI Billing Removal Design

## 背景

当前 `commercial-studio` 同时承担产品工作台、任务系统、模型接入、钱包、账本、激活码、价格矩阵和利润率配置。这个边界已经偏离目标：总站应负责用户计费和额度，当前项目应只负责业务体验、任务执行、资产和模型中转。

新的方向是：当前项目后端只连接 NewAPI，拉取模型并转发请求；不再负责本地计费。

## 目标

- 移除当前仓库里的本地 `billing / wallet / redeem / pricing` 体系。
- 将计费权威收敛到 NewAPI / 总站。
- 当前项目保留用户身份、任务、资产、形象库、漫画流程和管理端排障能力。
- 模型目录来自 NewAPI，同步到当前项目后只维护可见性、展示名、能力标签和默认模型。

## 非目标

- 不在当前项目里实现新的充值、订单、会员、套餐或余额系统。
- 不继续维护本地兑换码。
- 不继续维护本地价格矩阵、利润率、成本利润报表。
- 不在前端模拟余额或假装扣费成功。

## 目标架构

### 责任边界

NewAPI / 总站负责：

- 用户额度与计费。
- 真实模型价格。
- 供应商渠道、Key 池和上游成本。
- 用量统计和扣费账本。

当前项目负责：

- 用户登录态和业务归属。
- 公开生图、漫画、提示词应用、形象库和资产库。
- 图片任务 / 漫画任务的入队、worker 执行、状态持久化。
- NewAPI 模型同步和站内可见模型配置。
- 上游错误、request id、token usage、结果资产的排障展示。

### 后端数据流

1. 管理员配置 `NEWAPI_BASE_URL` 和 `NEWAPI_API_KEY_ENV`。
2. 后端通过 NewAPI 兼容 `/v1/models` 拉取模型。
3. 管理员选择站内可见模型，并设置展示名、能力标签、默认模型。
4. 用户提交生图或漫画任务。
5. API 创建本地任务记录，不查余额、不冻结额度、不写本地账本。
6. worker 从任务记录读取模型和参数，调用 NewAPI。
7. worker 保存结果资产、token usage、request id 和错误信息。
8. 前端展示任务状态和资产，不展示本地余额或价格。

### 前端边界

用户端：

- 保留登录、任务历史、资产、形象库、生图和漫画。
- 移除 `/wallet`、余额、兑换码、充值、扣费和价格展示。
- 请求失败时显示真实 NewAPI / 后端错误。

管理端：

- 保留用户、模型目录、任务、图库、形象库、设置、审计和设施面板。
- 移除钱包与账本、激活码、价格矩阵、批量定价、利润率、收入毛利。
- 将供应商页重构为“NewAPI 接入 / 模型目录”。
- 概览页从收入运营改为任务健康、失败任务、模型同步状态和 worker 告警。

## 模块处理

### 保留

- `auth`：只做身份和业务归属，不创建钱包。
- `image`：保留任务和资产；移除扣费字段的业务含义。
- `comic`：保留工作流；调用模型时走 NewAPI 模型目录。
- `llm`：改成 NewAPI connector、模型同步、请求 adapter。
- `assets` / gallery / character-library：保留。
- `settings`：保留站点开关，增加 NewAPI 连接配置。
- `ops`：保留 worker 和任务观测。

### 移除

- `billing` 域。
- `redeem` 域。
- `wallets`、`wallet_ledger`、`wallet_reservations`。
- `activation_code_batches`、`activation_codes`。
- `sellable model` 中的会员价、匿名价、利润率、价格矩阵。
- 图片任务里的本地扣费、冻结和结算流程。

## 迁移策略

### 阶段 1：逻辑移除

先让运行时完全不再读写本地计费：

- API 不创建 wallet。
- 图片任务不创建 reservation。
- worker 成功或失败不 commit / release 本地钱包。
- 前端不请求 wallet / redeem API。
- 后台不展示 billing / redeem / pricing。

这个阶段旧表和旧字段可以暂留，降低回滚风险。

### 阶段 2：模型目录重塑

将 provider / sellable model 从“可售模型”改成“NewAPI 模型目录”：

- 后端拉取 NewAPI 模型。
- 管理端维护站内可见性和能力标签。
- 公开端读取可见模型。
- 不再返回价格字段。

### 阶段 3：物理清理

逻辑稳定后再通过 migration 删除旧表和字段：

- 删除 wallet / ledger / reservation / redeem 表。
- 删除 image job 的 `reservation_id`、`charge_cents`、`internal_cost_cents` 等本地计费字段。
- 删除 model variant 价格字段和价格矩阵接口。

## 错误处理

- NewAPI 连接失败、模型拉取失败、请求失败都必须显式返回错误。
- 不增加 mock success。
- 不增加静默 fallback。
- 不用旧 provider 或本地价格系统兜底。

## 验收标准

- 当前项目没有任何运行时代码会创建、冻结、提交或释放本地钱包余额。
- 用户端没有余额、钱包、兑换码、价格或扣费文案。
- 管理端没有钱包调账、激活码、价格矩阵、利润率、收入毛利。
- `/api/public/models` 数据来自 NewAPI 同步后的站内模型目录，且不包含价格字段。
- 图片和漫画任务能通过 NewAPI 模型执行。
- 失败任务能展示真实错误和 request id。
- 旧 billing / redeem API 被删除或返回明确下线错误，不被前端调用。
