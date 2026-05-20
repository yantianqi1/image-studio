# Subagent Execution Contract

## Batch 0: Foundation

主控串行负责：

- 仓库骨架
- 共享类型
- API response contract
- FastAPI 健康检查
- 前端双入口
- worker 启动骨架

## Batch 1: Auth / LLM / Image

可并发：

- A1 Auth Agent: `apps/api/app/domains/auth/*`
- A2 LLM Agent: `apps/api/app/domains/llm/*`
- A3 Image Agent: `apps/api/app/domains/image/*`
- A4 Public Web Agent: `apps/public-web/src/features/*`

## Batch 2: Comic / Settings / Ops

可并发：

- B1 Comic Data Agent: `apps/api/app/domains/comic/*`
- B2 Settings Agent: `apps/api/app/domains/settings/*`
- B3 Ops Agent: `apps/api/app/domains/ops/*`

## Batch 3: Admin Ops

可并发：

- C1 Admin Shell Agent: `apps/admin-web/src/features/shell/*`
- C2 Provider Admin Agent: `apps/admin-web/src/features/providers/*`
- C3 Jobs Admin Agent: `apps/admin-web/src/features/jobs/*`
- C4 Users Admin Agent: `apps/admin-web/src/features/users/*`
- C5 Settings Admin Agent: `apps/admin-web/src/features/settings/*`

## Batch 4: Integration

主控串行负责：

- SDK 收口
- migration review
- 全量测试
- 前端构建
- worker 冒烟
- 部署文档
- 最终代码审查
