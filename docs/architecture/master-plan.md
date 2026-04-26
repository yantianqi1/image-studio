# image Studio Master Plan

## 目标

新仓库独立承接商业化闭环：

- 用户注册、登录、会话
- 钱包、冻结、扣费、账本
- 激活码生成与兑换
- 公开生图用户端
- 漫画创作工作台
- 后台运营界面
- 外部 LLM Provider 接入

## 当前定位

`commercial-studio` 不是在旧仓库内继续叠加运行时，而是一个新的独立商业化仓库。

- 复制旧仓库里已经验证过的页面结构、业务规则和漫画模块边界
- 重构数据库、Provider 接入、任务系统和前后端部署形态
- 目标是形成一个可单独部署、可单独运营、可继续商业化迭代的新产品仓库

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

## 当前开发方案

### 方案总览

开发按 6 个阶段推进：

1. `Foundation`
2. `Commercial Base`
3. `Image + Provider`
4. `Comic Core`
5. `Admin Ops`
6. `Production Hardening`

### 阶段说明

#### 1. Foundation

目标：

- 新仓库骨架
- workspace
- 共享类型与 SDK
- API 健康检查
- 双前端应用入口
- worker 启动骨架

#### 2. Commercial Base

目标：

- 用户注册、登录、会话
- 管理员登录
- 钱包、账本、冻结、提交、释放
- 激活码批次、兑换、状态追踪

#### 3. Image + Provider

目标：

- 对外模型目录
- Provider 抽象
- 图片任务创建、执行、结果记录、资产落盘
- 图片任务后台查询

#### 4. Comic Core

目标：

- 漫画项目、角色、章节、分镜
- 漫画任务与状态查询
- 漫画前端工作台

#### 5. Admin Ops

目标：

- 用户、钱包、激活码、Provider、图片任务、漫画任务后台页
- 站点设置后台页

#### 6. Production Hardening

目标：

- 默认管理员初始化策略
- 环境变量清单
- 部署与运行说明
- 完整验证与清理

## 当前里程碑状态

- `Foundation`：已完成
- `Commercial Base`：已完成
- `Image + Provider`：已完成最小可运行版
- `Comic Core`：已完成最小可运行版
- `Admin Ops`：已完成最小可运行版
- `Production Hardening`：已完成本轮收口（正式迁移、worker 观测摘要、`site_title`/上传域已补齐）

## 已落地能力

### 后端

- `auth`：用户注册、登录、登出、`me`
- `admin auth`：管理员登录、登出、`me`
- `billing`：钱包、账本、reservation
- `redeem`：激活码批次创建、兑换码兑换、列表查询
- `llm`：`openai-compatible` provider、sellable model 管理、公开模型目录、Provider 列表/创建
- `image`：图片任务入队、worker 执行、结果记录、失败重试、provider 快照、资产文件输出、后台任务列表
- `ops`：`/api/admin/ops/worker-summary` 任务观测摘要与陈旧任务告警
- `comic`：项目 CRUD、角色/章节/分镜保存、任务创建与查询
- `settings`：站点设置读取与更新，公开注册 / 匿名生图 / edit 入口开关生效，`site_title` 已进入前端 metadata
- `billing admin`：钱包查询、ledger、手工调账

### 前端

- `public-web`：
  - `/`
  - `/login`
  - `/wallet`
  - `/comic`
  - `/tasks`
- `admin-web`：
  - `/`
  - `/login`
  - `/users`
  - `/billing`
  - `/redeem`
  - `/providers`
  - `/image-jobs`
  - `/comic-jobs`
  - `/settings`

## 当前执行顺序

1. 多 worker 并发控制继续补强
2. provider 运维闭环与失败分析补强
3. 发布脚本与生产运维细节补强
