# Subagent Execution Contract

## Batch 0: Foundation

主控串行负责：

- 仓库骨架
- 共享类型
- API response contract
- FastAPI 健康检查
- 前端双入口
- worker 启动骨架
- 文档和验证脚本

## Batch 1: Commercial Base

可并发：

- A1 Auth Agent: `apps/api/app/domains/auth/*`
- A2 Billing Agent: `apps/api/app/domains/billing/*`
- A3 Redeem Agent: `apps/api/app/domains/redeem/*`
- A4 Admin Shell Agent: `apps/admin-web/src/features/shell/*`

## Batch 2: Image and Provider

可并发：

- B1 Provider Agent: `apps/api/app/domains/llm/*`
- B2 Image Job Agent: `apps/api/app/domains/image/*`
- B3 Public Web Agent: `apps/public-web/src/features/image/*`

## Batch 3: Comic

可并发：

- C1 Comic Data Agent: `apps/api/app/domains/comic/projects/*`
- C2 Comic Task Agent: `apps/api/app/domains/comic/tasks/*`
- C3 Comic Workflow Agent: `apps/api/app/domains/comic/workflows/*`
- C4 Comic UI Agent: `apps/public-web/src/features/comic/*`

## Batch 4: Admin Ops

可并发：

- D1 Provider Admin Agent: `apps/admin-web/src/features/providers/*`
- D2 Pricing Admin Agent: `apps/admin-web/src/features/pricing/*`
- D3 Redeem Admin Agent: `apps/admin-web/src/features/redeem/*`
- D4 Jobs Admin Agent: `apps/admin-web/src/features/jobs/*`
- D5 Settings Admin Agent: `apps/admin-web/src/features/settings/*`

## Batch 5: Integration

主控串行负责：

- SDK 收口
- migration review
- 全量测试
- 前端构建
- worker 冒烟
- 部署文档
- 最终代码审查

