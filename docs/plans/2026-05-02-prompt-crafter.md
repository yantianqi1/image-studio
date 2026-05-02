# Prompt Crafter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `apps/public-web` 增加一个流式 Prompt Crafter 聊天窗口，读取复制进项目的 `gpt-image-2-prompt-crafter` skill，输出高质量 GPT-image-2 提示词。

**Architecture:** 后端新增一个 public prompt-crafter 领域，复用现有 OpenAI-compatible chat adapter 但改成流式返回文本。前端新增一个独立工作台页面，使用自实现流式读取把模型输出逐段显示出来；界面沿用项目已有 workspace 结构，但用更克制、工具型的视觉语言。

**Tech Stack:** FastAPI, existing llm adapter, Next.js App Router, React, CSS Modules, existing public API client.

---

### Task 1: 固化 skill 资源和失败测试

**Files:**
- Create: `apps/api/tests/test_prompt_crafter_skill_assets.py`
- Create: `apps/api/tests/test_prompt_crafter_stream.py`

**Step 1: Write the failing test**

```python
def test_skill_assets_exist():
    assert Path(".codex/skills/gpt-image-2-prompt-crafter/SKILL.md").exists()
    assert Path(".codex/skills/gpt-image-2-prompt-crafter/references/prompt-patterns.md").exists()
```

**Step 2: Run test to verify it fails**

Run: `pytest -q apps/api/tests/test_prompt_crafter_skill_assets.py`
Expected: FAIL if asset copy missing or path wrong.

**Step 3: Write minimal implementation**

Copy the skill directory into the project root and expose no behavior yet.

**Step 4: Run test to verify it passes**

Run: `pytest -q apps/api/tests/test_prompt_crafter_skill_assets.py`
Expected: PASS

---

### Task 2: 后端流式 prompt-crafter 领域

**Files:**
- Create: `apps/api/app/domains/prompt_crafter/__init__.py`
- Create: `apps/api/app/domains/prompt_crafter/routes.py`
- Create: `apps/api/app/domains/prompt_crafter/service.py`
- Modify: `apps/api/app/api/router.py`
- Modify: `apps/api/app/domains/llm/openai_chat.py`
- Modify: `apps/api/tests/test_openai_chat_payload.py`
- Create: `apps/api/tests/test_prompt_crafter_stream.py`

**Step 1: Write the failing test**

```python
def test_prompt_crafter_stream_returns_text_chunks(client, monkeypatch):
    ...
```

Assert:
- route exists
- stream starts
- prompt-crafter system prompt includes skill content
- provider errors surface as API errors

**Step 2: Run test to verify it fails**

Run: `python -m pytest -q apps/api/tests/test_prompt_crafter_stream.py --maxfail=1`
Expected: FAIL because route/service not implemented.

**Step 3: Write minimal implementation**

Reuse chat target resolution and auth headers from `openai_chat.py`. Add a dedicated streaming builder that:
- loads the skill files
- builds a single system prompt
- posts `stream=true` to the provider
- yields decoded text chunks

**Step 4: Run test to verify it passes**

Run: `python -m pytest -q apps/api/tests/test_prompt_crafter_stream.py --maxfail=1`
Expected: PASS

---

### Task 3: 前端 prompt-crafter 工作台

**Files:**
- Create: `apps/public-web/src/features/prompt-crafter/prompt-crafter-app.tsx`
- Create: `apps/public-web/src/features/prompt-crafter/prompt-crafter.module.css`
- Create: `apps/public-web/src/features/prompt-crafter/prompt-crafter-api.ts`
- Create: `apps/public-web/src/app/apps/prompt-crafter/page.tsx`
- Create: `apps/public-web/tests/prompt-crafter-page.test.mjs`

**Step 1: Write the failing test**

```javascript
test("prompt crafter page renders workspace shell and submit controls", ...)
```

Assert:
- route file exists
- page source does not hardcode the full skill text
- UI has input, send button, streaming result area

**Step 2: Run test to verify it fails**

Run: `pnpm --filter public-web test -- prompt-crafter-page.test.mjs`
Expected: FAIL because files are missing.

**Step 3: Write minimal implementation**

Build a two-panel workspace:
- left input panel for user idea
- right streaming result panel
- action row for copy / reuse

Keep the layout quiet, tool-like, and dense.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter public-web test -- prompt-crafter-page.test.mjs`
Expected: PASS

---

### Task 4: 应用中心接入与复用入口

**Files:**
- Modify: `apps/public-web/src/features/prompt-apps/prompt-apps.ts`
- Modify: `apps/public-web/src/features/prompt-apps/prompt-apps-home.tsx`
- Modify: `apps/public-web/src/features/shell/app-navigation.ts`
- Create: `apps/public-web/tests/prompt-crafter-app-card.test.mjs`

**Step 1: Write the failing test**

Assert the new app card appears in the catalog and links to `/apps/prompt-crafter`.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter public-web test -- prompt-crafter-app-card.test.mjs`
Expected: FAIL

**Step 3: Write minimal implementation**

Add the new catalog item and route link, no extra abstractions.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter public-web test -- prompt-crafter-app-card.test.mjs`
Expected: PASS

---

### Task 5: 验证

**Files:**
- All touched files

**Step 1: Run targeted tests**

Run:
- `python -m pytest -q apps/api/tests/test_prompt_crafter_skill_assets.py apps/api/tests/test_prompt_crafter_stream.py --maxfail=1`
- `pnpm --filter public-web test`
- `pnpm --filter public-web typecheck`
- `pnpm --filter public-web lint`

**Step 2: Inspect line counts**

Run: `wc -l` on touched feature and test files.

**Step 3: Confirm fixed-port behavior**

If the public dev server is already running, smoke-check `/apps/prompt-crafter` on port `7700`; otherwise start `pnpm dev:public`.
