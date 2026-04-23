# Commercial Studio Agent Rules

默认使用中文回复用户。

## 工程原则

- 不引入静默 fallback、mock success 或吞错路径。
- 所有失败必须显式暴露为错误、日志、异常或失败测试。
- 金额使用整数 cents，不使用 float 做账务。
- 业务逻辑按领域拆分，不跨领域直接读写内部状态。
- 长任务必须进入 worker，不允许 API 路由里直接执行漫画或生图长任务。
- Provider 调用必须经过统一 adapter，不允许业务域直连供应商 SDK。

## 文件边界

- `apps/api/app/core/*` 由主控 Agent 维护。
- `packages/types/*` 由主控 Agent 维护。
- `packages/sdk/*` 由主控 Agent 或 SDK 专属 Agent 维护。
- `db/migrations/*` 每个批次只能一个 Agent 修改。
- 业务 Agent 只能修改自己负责的 `apps/api/app/domains/<domain>/*`。
- 前端 Agent 只能修改自己负责的 `apps/*/src/features/<feature>/*`。

## 验证要求

- 后端测试命令必须加 60 秒以内的超时控制。
- 声称完成前必须运行相关测试或构建。
- 不允许只靠人工判断或“应该可以”作为完成依据。

## Subagent 规则

- Batch 0 由主控串行完成。
- Batch 1 起才允许并发。
- 每个 subagent 必须返回修改文件、测试命令、测试结果和边界外修改情况。
- reviewer 未通过时，不得进入下一批次。

