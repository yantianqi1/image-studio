# Comic Character Reference Consistency Frontend and E2E Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose the real comic reference workflow in the frontend and verify it with a production-like local run.

**Architecture:** The frontend should represent backend state directly: project creation, task creation, LLM processing, character reference generation, page image generation, completion, and failure. It must not show fake agent progress when no task exists.

**Tech Stack:** Next.js, TypeScript, existing public API client, FastAPI backend, Docker Compose, pytest, pnpm typecheck.

---

### Task 6: Expose Real States in Frontend

**Files:**
- Modify: `apps/public-web/src/lib/public-api.ts`
- Modify: `apps/public-web/src/features/comic/comic-studio.tsx`
- Modify: `apps/public-web/src/features/comic/comic-state.ts`
- Modify: `apps/public-web/src/features/comic/storyboard-planning-panel.tsx`
- Modify: `apps/public-web/src/features/comic/manga-preview-panel.tsx`

**Step 1: Add API client methods**

In `apps/public-web/src/lib/public-api.ts`, add methods:

```ts
approveComicCharacterReferences(taskId: string)
getComicCharacterReferences(taskId: string)
syncComicCharacterReferences(taskId: string)
approveComicTaskImageGeneration(taskId: string)
getComicTaskImageResults(taskId: string)
```

Add types for character reference response:

```ts
export type ComicCharacterReference = Readonly<{
  id: number;
  character_code: string;
  name: string;
  reference_image_job_id: number | null;
  reference_asset_id: number | null;
  image_status: string | null;
  error_message: string | null;
}>;
```

**Step 2: Update state machine terms**

In `comic-state.ts`, replace ambiguous project-only status with explicit states:

- `empty`
- `project_created_no_task`
- `task_queued`
- `llm_processing`
- `character_reference_pending`
- `character_reference_generating`
- `character_reference_ready`
- `page_image_generating`
- `completed`
- `failed`

Rule: never return `llm_processing` unless at least one real comic task exists.

**Step 3: Wire real workflow actions**

In `comic-studio.tsx`:

- Creating a project should not imply generation has started.
- Add task creation call after project creation only when the user initiates generation.
- After task completion, call character reference approval.
- Poll/sync character references until ready.
- After references are ready, call page image approval.
- Poll image results until final completion.

Do not add fake timers or optimistic completed states.

**Step 4: Update planning panel copy**

In `storyboard-planning-panel.tsx`, make labels match real phases:

- 剧情分析
- 人物设定
- 角色参考图
- 分镜生成
- 漫画页面生成

If `project_created_no_task`, show “项目已创建，尚未创建生成任务”.

**Step 5: Update preview panel copy**

In `manga-preview-panel.tsx`, show:

- reference generation pending,
- reference generation failed,
- page image generating,
- final image ready.

Surface backend `error_message` directly.

**Step 6: Typecheck frontend**

Run:

```bash
pnpm typecheck:public
```

Expected: PASS.

---

### Task 7: Production-Like Manual Verification

**Files:**
- No source files.

**Step 1: Upgrade database**

Run:

```bash
docker exec commercial-studio-api alembic -c alembic.ini upgrade head
```

Expected: Alembic current head includes `20260426_000005`.

**Step 2: Restart services**

Run:

```bash
docker compose restart api worker public-web
```

Expected: API, worker, and public web restart cleanly.

**Step 3: Verify health**

Run:

```bash
curl -sS http://localhost:7800/health
```

Expected: `status` is `ok`.

**Step 4: Create safe test story**

Use adult, non-sexual, non-school story content. Example:

```text
一名成年项目经理在发布会前高烧硬撑，体能教练用秒表压迫她完成恢复训练，同事试图劝她去医务室。走廊灯光刺眼，秒表声和急促脚步制造悬疑感。
```

**Step 5: Create project and task through API**

Call project creation and task creation endpoints. Save `PROJECT_ID` and `TASK_ID`.

Expected:

- project status is `draft`,
- task status starts as `pending`,
- worker later marks task `completed`.

**Step 6: Approve and verify character references**

Call:

```bash
curl -sS -X POST http://localhost:7800/api/public/comic/tasks/$TASK_ID/character-references
```

Expected:

- one image job per character,
- character rows have non-null `reference_image_job_id`,
- `reference_asset_id` is null until jobs finish.

**Step 7: Wait for reference image jobs**

Poll image jobs until all reference jobs are `succeeded` or `failed`.

Expected for success path: all are `succeeded`.

**Step 8: Sync references**

Call:

```bash
curl -sS -X POST http://localhost:7800/api/public/comic/tasks/$TASK_ID/character-references/sync
```

Expected:

- every character card has non-null `reference_asset_id`,
- reference asset URLs return image content.

**Step 9: Approve page image generation**

Call:

```bash
curl -sS -X POST http://localhost:7800/api/public/comic/tasks/$TASK_ID/approve-and-generate-images
```

Expected:

- page image jobs are created,
- every page job has rows in `image_job_reference_assets`,
- prompt contains identity-lock wording.

**Step 10: Wait for final page image**

Poll final page image job until terminal state.

Expected:

- status is `succeeded`,
- final asset URL returns `200 OK`,
- `content-type` is an image MIME type,
- image byte length is greater than zero.

**Step 11: Verify frontend state**

Open `http://localhost:7700/comic`.

Expected:

- project-only state does not say real agent is processing,
- LLM phase appears only after a task exists,
- character reference phase appears while reference jobs run,
- page generation phase appears only after references are ready,
- final preview uses real image result.

---

## Manual Verification SQL

Use these checks during final verification:

```sql
select id, status, stage, progress_percent, error_code, error_message
from comic_tasks
where id = '<TASK_ID>';

select character_code, name, reference_image_job_id, reference_asset_id
from comic_character_cards
where task_id = '<TASK_ID>';

select ijra.job_id, ijra.asset_id, ijra.sequence
from image_job_reference_assets ijra
join image_jobs ij on ij.id = ijra.job_id
where ij.source = 'anonymous'
order by ijra.job_id, ijra.sequence;

select id, job_id, asset_url
from image_job_results
where job_id = '<PAGE_IMAGE_JOB_ID>';
```

## Final Verification Commands

Run all focused checks before claiming completion:

```bash
python3 -m pytest apps/api/tests/test_comic_reference_e2e.py apps/api/tests/test_comic_character_references.py apps/api/tests/test_comic_image_generation.py apps/api/tests/test_comic_task_queue.py apps/api/tests/test_image_jobs.py apps/api/tests/test_migrations.py -q
pnpm typecheck:public
```

Expected:

- pytest exits 0,
- frontend typecheck exits 0,
- manual safe E2E produces final image asset.
