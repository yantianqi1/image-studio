# Image Worker Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把图片任务从 API 同步执行改为真实入队，由 worker 负责 claim、执行和 retry。

**Architecture:** API 只负责创建 `image_jobs` 记录和账务预留，不再直接调用渲染。`image` 域提供 claim / success / retry / terminal-failure 生命周期函数，`worker` 通过单次 polling 取出可执行任务并驱动处理。retry 不引入静默 fallback，失败状态和错误信息如实落库。

**Tech Stack:** FastAPI, SQLAlchemy, pytest, worker polling loop

---

### Task 1: Queue Lifecycle In Image Domain

**Files:**
- Modify: `apps/api/app/domains/image/models.py`
- Modify: `apps/api/app/domains/image/service.py`
- Modify: `packages/types/src/index.ts`

**Step 1: Write the failing test**

在 `apps/api/tests/test_image_jobs.py` 增加断言：
- 创建任务后接口返回 `queued`
- 结果列表初始为空
- 任务记录包含 attempt 元信息

**Step 2: Run test to verify it fails**

Run: `timeout 60s pytest apps/api/tests/test_image_jobs.py -q`
Expected: FAIL，因为当前接口会同步执行并返回 `succeeded`

**Step 3: Write minimal implementation**

给 `ImageJob` 增加 queue/retry 所需字段，并在 service 中拆出：
- 创建任务
- claim 下一个可执行任务
- 标记成功
- 标记可重试失败
- 标记最终失败

**Step 4: Run test to verify it passes**

Run: `timeout 60s pytest apps/api/tests/test_image_jobs.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/app/domains/image/models.py apps/api/app/domains/image/service.py packages/types/src/index.ts apps/api/tests/test_image_jobs.py
git commit -m "feat: add image job queue lifecycle"
```

### Task 2: Worker Claim And Execute

**Files:**
- Modify: `apps/worker/worker/main.py`
- Modify: `apps/worker/worker/tasks/image_jobs.py`
- Modify: `apps/worker/worker/config.py`
- Test: `apps/api/tests/test_image_jobs.py`

**Step 1: Write the failing test**

增加断言：
- worker 单次执行能 claim 一个 queued 任务
- claim 后任务变为 `running` / `succeeded`
- 成功后能看到结果资产

**Step 2: Run test to verify it fails**

Run: `timeout 60s pytest apps/api/tests/test_image_jobs.py -q`
Expected: FAIL，因为当前 worker 没有真实 polling/claim 行为

**Step 3: Write minimal implementation**

实现：
- `run_next_image_job()` 单次处理
- `worker.main` 支持一次轮询与持续轮询
- worker 通过数据库 session 驱动图片任务执行

**Step 4: Run test to verify it passes**

Run: `timeout 60s pytest apps/api/tests/test_image_jobs.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/worker/worker/main.py apps/worker/worker/tasks/image_jobs.py apps/worker/worker/config.py apps/api/tests/test_image_jobs.py
git commit -m "feat: wire worker image job execution"
```

### Task 3: Retry And Billing Release Rules

**Files:**
- Modify: `apps/api/app/domains/image/service.py`
- Test: `apps/api/tests/test_image_jobs.py`

**Step 1: Write the failing test**

增加两个场景：
- 第一次执行失败时回到 `queued`，保留 reservation，等待下一次 retry
- 达到最大尝试次数后标记 `failed`，释放 reservation

**Step 2: Run test to verify it fails**

Run: `timeout 60s pytest apps/api/tests/test_image_jobs.py -q`
Expected: FAIL，因为当前失败路径会直接终态失败并释放资金

**Step 3: Write minimal implementation**

补齐 retry 计数、可重试时间和最终失败逻辑，确保账务只在成功提交或最终失败时结算。

**Step 4: Run test to verify it passes**

Run: `timeout 60s pytest apps/api/tests/test_image_jobs.py -q`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/app/domains/image/service.py apps/api/tests/test_image_jobs.py
git commit -m "feat: add image job retry lifecycle"
```

### Task 4: Docs And Verification

**Files:**
- Modify: `docs/architecture/current-status.md`
- Modify: `docs/architecture/master-plan.md`

**Step 1: Update docs**

写明：
- 图片任务已改为 API 入队 + worker 执行
- 当前 retry/claim 已具备最小生产化能力
- 仍未完成的边界

**Step 2: Run verification**

Run: `timeout 60s pytest apps/api/tests/test_image_jobs.py -q`
Expected: PASS

Run: `timeout 60s pytest apps/api/tests -q`
Expected: PASS

Run: `python -m apps.worker.worker.main --once`
Expected: exit 0，并输出本轮 worker 结果

**Step 3: Commit**

```bash
git add docs/architecture/current-status.md docs/architecture/master-plan.md apps/api/tests/test_image_jobs.py apps/api/app/domains/image/service.py apps/api/app/domains/image/models.py apps/worker/worker/main.py apps/worker/worker/tasks/image_jobs.py apps/worker/worker/config.py packages/types/src/index.ts
git commit -m "feat: queue image jobs through worker"
```
