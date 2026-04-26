# Comic Character Reference Consistency Backend B Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate character reference sheet jobs from comic character cards, sync completed assets, and require those references before comic page generation.

**Architecture:** Add a comic-domain service for character references. It reuses image jobs for actual generation and keeps comic-specific state on `ComicCharacterCard`. Page approval becomes a gated operation that refuses to generate pages until relevant references are ready.

**Tech Stack:** FastAPI, SQLAlchemy, existing comic pipeline, existing image job worker, pytest.

---

### Task 3: Generate Character Reference Jobs

**Files:**
- Create: `apps/api/app/domains/comic/character_references.py`
- Modify: `apps/api/app/domains/comic/router.py`
- Modify: `apps/api/app/domains/comic/repository.py`
- Test: `apps/api/tests/test_comic_character_references.py`

**Step 1: Write failing API test**

Create `apps/api/tests/test_comic_character_references.py`.

Test flow:

1. Create comic client.
2. Create project.
3. Create comic task.
4. Monkeypatch structured LLM outputs so comic worker creates character cards.
5. Run `worker_comic_tasks.run_next_comic_task()`.
6. Call `POST /api/public/comic/tasks/{task_id}/character-references`.
7. Assert response status is `201` or `200` according to route convention.
8. Assert `created_count == character_count`.
9. Assert each returned character has `reference_image_job_id` and `reference_asset_id is None`.

**Step 2: Run test to verify it fails**

Run:

```bash
python3 -m pytest apps/api/tests/test_comic_character_references.py::test_approve_character_references_enqueues_jobs -q
```

Expected: FAIL because the endpoint does not exist.

**Step 3: Add repository helpers**

Add helpers in `apps/api/app/domains/comic/repository.py`:

```python
def list_character_cards(session: Session, *, task_id: str) -> list[ComicCharacterCard]: ...
def get_character_card(session: Session, card_id: int) -> ComicCharacterCard | None: ...
def update_character_reference_job(session: Session, *, card: ComicCharacterCard, job_id: int) -> None: ...
def update_character_reference_asset(session: Session, *, card: ComicCharacterCard, asset_id: int) -> None: ...
```

Keep helpers small and avoid business rules in repository code.

**Step 4: Implement character reference service**

Create `apps/api/app/domains/comic/character_references.py` with:

```python
def approve_character_references(session: Session, task_id: str) -> dict: ...
def sync_completed_character_references(session: Session, task_id: str) -> dict: ...
def list_character_references(session: Session, task_id: str) -> list[dict]: ...
```

Rules for `approve_character_references`:

- Require completed comic task.
- Require at least one `ComicCharacterCard`.
- For each card without `reference_image_job_id`, create an image job from `card.multi_view_prompt`.
- Use `source="anonymous"`, `mode="generate"`, `requested_count=1`.
- Store `card.reference_image_job_id`.
- Reuse existing job IDs if already present.

Rules for `sync_completed_character_references`:

- For each card with `reference_image_job_id`, inspect image job status.
- If succeeded, copy first `ImageJobResult.asset_id` into `reference_asset_id`.
- If failed, include job error in payload.
- If running/queued, report not ready.

**Step 5: Add routes**

In `apps/api/app/domains/comic/router.py`, add:

```python
@public_router.post("/tasks/{task_id}/character-references", status_code=status.HTTP_201_CREATED)
def approve_character_references_endpoint(...): ...

@public_router.get("/tasks/{task_id}/character-references")
def list_character_references_endpoint(...): ...

@public_router.post("/tasks/{task_id}/character-references/sync")
def sync_character_references_endpoint(...): ...
```

**Step 6: Add reuse and failure tests**

Add tests:

```python
def test_approve_character_references_reuses_existing_jobs(): ...
def test_sync_character_references_persists_completed_assets(): ...
def test_sync_character_references_reports_failed_reference_jobs(): ...
def test_approve_character_references_requires_completed_task(): ...
```

**Step 7: Run focused tests**

Run:

```bash
python3 -m pytest apps/api/tests/test_comic_character_references.py -q
```

Expected: PASS.

---

### Task 4: Block Page Generation Until References Are Ready

**Files:**
- Modify: `apps/api/app/domains/comic/image_generation.py`
- Modify: `apps/api/app/domains/comic/prompt_composer.py`
- Test: `apps/api/tests/test_comic_image_generation.py`
- Test: `apps/api/tests/test_comic_prompt_composer.py`

**Step 1: Write failing blocking test**

After comic task completion, call:

```python
response = client.post(f"/api/public/comic/tasks/{task_id}/approve-and-generate-images")
```

Expected:

```python
assert response.status_code == 409
assert response.json()["error"]["code"] == "comic_character_references_not_ready"
```

**Step 2: Run test to verify it fails**

Run:

```bash
python3 -m pytest apps/api/tests/test_comic_image_generation.py::test_page_generation_requires_character_references -q
```

Expected: FAIL because current code enqueues page images without references.

**Step 3: Resolve required references per panel prompt**

In `apps/api/app/domains/comic/image_generation.py`, add helper:

```python
def resolve_prompt_reference_asset_ids(session: Session, *, prompt: ComicPanelPrompt) -> list[int]: ...
```

Rules:

- Read `prompt.character_codes`.
- If empty, return `[]`.
- Load cards by `task_id` and `character_code`.
- Require every code to exist.
- Require every card to have `reference_asset_id`.
- Preserve character order from `prompt.character_codes`.

**Step 4: Raise explicit readiness error**

If any character reference is missing, raise:

```python
AppError(
    code="comic_character_references_not_ready",
    message="comic character references are not ready",
    status_code=409,
)
```

Do not fall back to prompt-only generation.

**Step 5: Attach references to page image jobs**

Change `enqueue_prompt_image_job` to pass:

```python
reference_asset_ids=reference_asset_ids
```

Use `mode="generate"`, not `edit`, unless the provider integration explicitly requires edit mode and tests cover that behavior.

**Step 6: Strengthen prompt composer identity lock**

Update `build_character_block` to include:

```text
Character identity lock:
Each named character must remain the exact same person in every panel on this image.
Use attached reference character sheets as canonical identity sources.
Do not reinterpret age, face shape, hairstyle, body type, costume silhouette, color palette, or signature items between panels.
If a character appears in multiple panels, copy the same identity design from the reference sheet into every panel.
```

Update `build_global_constraints` to explicitly prohibit:

- alternate outfits unless specified,
- changing hair length/color,
- changing facial structure,
- changing age/body type,
- treating panels as separate character designs.

**Step 7: Add prompt composer test**

In `apps/api/tests/test_comic_prompt_composer.py`, assert the composed prompt includes:

```python
assert "Character identity lock" in prompt.prompt
assert "attached reference character sheets" in prompt.prompt
assert "same person in every panel" in prompt.prompt
```

**Step 8: Run focused tests**

Run:

```bash
python3 -m pytest apps/api/tests/test_comic_image_generation.py apps/api/tests/test_comic_prompt_composer.py -q
```

Expected: PASS.

---

### Task 5: Add Backend E2E Test

**Files:**
- Create: `apps/api/tests/test_comic_reference_e2e.py`

**Step 1: Write E2E test with fake renderer**

Test sequence:

1. Create project.
2. Create comic task.
3. Monkeypatch structured LLM outputs.
4. Run comic worker.
5. Approve character references.
6. Run image worker until all reference jobs complete.
7. Sync character references.
8. Approve page images.
9. Assert page image job has reference rows.
10. Run image worker for page job.
11. Assert `image-results` returns succeeded result.

**Step 2: Assert persisted state**

Database expectations:

- `comic_character_cards.reference_image_job_id` is non-null.
- `comic_character_cards.reference_asset_id` is non-null after sync.
- `image_job_reference_assets` has rows for the page job.
- Final `image_job_results.asset_url` exists.

**Step 3: Run E2E test**

Run:

```bash
python3 -m pytest apps/api/tests/test_comic_reference_e2e.py -q
```

Expected after Tasks 1-4: PASS.

**Step 4: Run backend comic slice**

Run:

```bash
python3 -m pytest apps/api/tests/test_comic_reference_e2e.py apps/api/tests/test_comic_character_references.py apps/api/tests/test_comic_image_generation.py apps/api/tests/test_comic_task_queue.py -q
```

Expected: PASS.
