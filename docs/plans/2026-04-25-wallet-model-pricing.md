# Wallet Model Pricing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect default OpenAI-compatible model catalog with wallet charging so image jobs charge the configured model price.

**Architecture:** Add explicit provider/model settings to `AppSettings`, then make `ensure_provider_catalog()` upsert the default OpenAI-compatible provider and two sellable models. Keep the existing image wallet reservation/commit/release flow unchanged and verify it reads prices from `sellable_models`.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic Settings, pytest.

---

### Task 1: Default Catalog Tests

**Files:**
- Modify: `apps/api/tests/test_provider_catalog.py`

**Step 1:** Add failing tests for default `.env`-driven provider/model catalog and `gpt-image-2` wallet reservation.
**Step 2:** Run targeted tests with a 60s timeout and verify failure.

### Task 2: Settings and Catalog Implementation

**Files:**
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/domains/llm/service.py`
- Modify: `.env`
- Modify: `.env.example`

**Step 1:** Add provider/model env settings.
**Step 2:** Upsert configured OpenAI-compatible provider and sellable models.
**Step 3:** Preserve existing local-dev model for tests/dev.

### Task 3: Verification

**Files:**
- Test: `apps/api/tests/test_provider_catalog.py`
- Test: `apps/api/tests/test_image_jobs.py`

**Step 1:** Run targeted pytest with a 60s timeout.
**Step 2:** Run broader API tests if targeted tests pass.
