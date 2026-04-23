# Commercial Studio Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 落地独立仓库骨架，为后续 auth、billing、image、comic 并发开发提供统一工程基础。

**Architecture:** 使用 `pnpm workspace + Next.js + FastAPI + Worker + PostgreSQL` 的多应用结构。先完成公共契约、共享包和最小可运行入口，再逐批并发扩展业务域。

**Tech Stack:** Next.js 16、React 19、TypeScript 5、FastAPI、Pydantic Settings、PostgreSQL

---

### Task 1: 建立 monorepo 根和文档契约

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `docs/architecture/master-plan.md`
- Create: `docs/plans/2026-04-23-commercial-studio-foundation.md`

**Step 1: 建根目录脚本与 workspace**

要求：
- 根目录能管理 `apps/*` 与 `packages/*`
- 写清端口和基础脚本

**Step 2: 落统一架构说明**

要求：
- 说明四个运行时
- 说明核心领域边界
- 说明后续执行顺序

### Task 2: 建共享包

**Files:**
- Create: `packages/types/*`
- Create: `packages/sdk/*`
- Create: `packages/ui/*`

**Step 1: 建共享类型**

要求：
- `ApiResponse`
- `ApiError`
- `HealthPayload`

**Step 2: 建前端 SDK**

要求：
- 统一 `fetch` 包装
- 保持错误结构一致

**Step 3: 建共享 UI 壳层**

要求：
- 给 `public-web` 和 `admin-web` 提供统一页面外框

### Task 3: 建最小 API 与 Worker 骨架

**Files:**
- Create: `apps/api/app/*`
- Create: `apps/api/tests/*`
- Create: `apps/worker/worker/*`

**Step 1: 先写健康检查测试**

要求：
- `GET /health`
- `GET /ready`

**Step 2: 再写最小实现**

要求：
- 返回统一响应结构
- API 启动时校验配置

### Task 4: 改造 public-web 与 admin-web 为仓库入口

**Files:**
- Modify: `apps/public-web/*`
- Modify: `apps/admin-web/*`

**Step 1: 收口为工作台占位页**

要求：
- 展示产品定位
- 展示端口与下一阶段模块

**Step 2: 接入共享 UI 包**

要求：
- 两端都使用统一壳层

### Task 5: 验证基础工程

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Step 1: 前端 typecheck**

Run:
- `pnpm typecheck:packages`
- `pnpm typecheck:public`
- `pnpm typecheck:admin`

**Step 2: API 测试**

Run:
- `pytest apps/api/tests -q`

**Step 3: 记录验证结果**

要求：
- 只根据真实命令输出报告状态

