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

## 漫创 Agent 当前事实

- 当前 `/comic` 页面里的“LLM Agent 处理中 / 自动拆解剧情 / 分镜生成 / 漫画页面生成”是前端状态与占位 UI，不代表真实后台 agent 正在执行。
- `comic_projects` 只表示项目已创建；不能据此推断剧情拆解、分镜或漫画生成已启动。
- `comic_tasks` 为空时，不存在可执行的漫创任务；前端若显示 `planning`，需要按状态映射问题排查，而不是假设 agent 卡住。
- 当前 `apps/worker/worker/main.py` 只轮询并处理 `image_jobs`，没有消费 `comic_tasks`。
- 当前 `apps/api/app/domains/comic/services.py` 的 `create_task()` 是 API 请求内同步执行，并通过本地数据拼接 `output_payload`；没有调用 LLM、没有进入 worker 队列、没有串联图片生成。
- 实现真实漫创流程时，必须显式设计任务队列、worker 消费、LLM adapter 调用、image job 串联、状态持久化和错误暴露；禁止用前端假进度、mock 输出或静默 fallback 伪装成功。

## Subagent 规则

- Batch 0 由主控串行完成。
- Batch 1 起才允许并发。
- 每个 subagent 必须返回修改文件、测试命令、测试结果和边界外修改情况。
- reviewer 未通过时，不得进入下一批次。
