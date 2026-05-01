# Generation History Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix high latency and UI jank when selecting generation history records after switching modules.

**Architecture:** Stop the polling loop from restarting itself by depending on stable history primitives instead of the whole `activeHistory` object. Add explicit abort support to image job polling and API fetches so stale polling stops when the user switches history. Reduce render and decode cost by showing thumbnails in the history result grid while keeping original URLs for preview and download.

**Tech Stack:** Next.js 16, React 19, TypeScript, node:test, Playwright for manual verification when needed.

---

### Task 1: Lock Down The Polling Storm Regression

**Files:**
- Modify: `apps/public-web/tests/generation-job-polling.test.mjs`
- Create: `apps/public-web/tests/generation-workbench-polling.test.mjs`

**Step 1: Add abort behavior tests for the polling helper**

Append tests to `apps/public-web/tests/generation-job-polling.test.mjs`:

```js
test("waitForImageJobResults stops polling when aborted during sleep", async () => {
  const { waitForImageJobResults } = loadPolling();
  const controller = new AbortController();
  let requestCount = 0;
  const api = {
    async getImageJob(jobId) {
      requestCount += 1;
      return { id: jobId, status: "running", error_message: null };
    },
    async getImageJobResults() {
      throw new Error("should not fetch results for running job");
    },
  };

  await assert.rejects(
    () => waitForImageJobResults(api, 99, {
      signal: controller.signal,
      sleep: async () => controller.abort(),
    }),
    /aborted/i,
  );
  assert.equal(requestCount, 1);
});
```

**Step 2: Add a source-level guard for the workbench effect**

Create `apps/public-web/tests/generation-workbench-polling.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/features/home/generation-workbench.tsx", import.meta.url),
  "utf8",
);

test("generation workbench polling effect uses stable dependencies and aborts stale polls", () => {
  assert.match(source, /const activeHistoryId = activeHistory\?\.id \?\? null;/);
  assert.match(source, /const activeTaskId = activeHistory\?\.taskId \?\? null;/);
  assert.match(source, /const shouldPollActiveHistory = shouldResumeImageJobHistory\(activeHistory\);/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal: abortController\.signal/);
  assert.doesNotMatch(source, /\}, \[activeHistory, completeHistory, failHistory\]\);/);
});
```

**Step 3: Run tests and confirm they fail first**

Run:

```bash
pnpm --filter public-web test -- generation-job-polling generation-workbench-polling
```

Expected: failures because `waitForImageJobResults` has no `signal` option and the workbench effect still depends on `activeHistory`.

---

### Task 2: Make Image Job Polling Explicitly Cancellable

**Files:**
- Modify: `apps/public-web/src/lib/api-client.ts`
- Modify: `apps/public-web/src/lib/public-api.ts`
- Modify: `apps/public-web/src/features/home/generation-job-polling.ts`
- Modify: `apps/public-web/src/features/home/generation-workbench.tsx`
- Test: `apps/public-web/tests/generation-job-polling.test.mjs`
- Test: `apps/public-web/tests/generation-workbench-polling.test.mjs`

**Step 1: Add request signal support to the API client**

In `apps/public-web/src/lib/api-client.ts`, extend `ApiRequestOptions`:

```ts
export type ApiRequestOptions = Readonly<{
  method?: ApiMethod;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}>;
```

Pass it into `fetch` in `apiFetch`, `apiDownload`, and `apiUpload`:

```ts
signal: options.signal,
```

Keep this explicit; do not catch or convert abort errors in the API client.

**Step 2: Let image job reads accept a signal**

In `apps/public-web/src/lib/public-api.ts`, change:

```ts
getImageJob(jobId: number, options: Pick<ApiRequestOptions, "signal"> = {}) {
  return apiFetch<ImageGenerationResponse>(`/image/jobs/${jobId}`, options);
},
getImageJobResults(jobId: number, options: Pick<ApiRequestOptions, "signal"> = {}) {
  return apiFetch<readonly ImageJobResult[]>(`/image/jobs/${jobId}/results`, options);
},
```

Import `ApiRequestOptions` from `api-client`.

**Step 3: Add signal-aware polling**

In `apps/public-web/src/features/home/generation-job-polling.ts`, replace the `Pick<PublicApiClient, ...>` type with a small local interface:

```ts
type ImageJobPollingApi = Readonly<{
  getImageJob: (jobId: number, options?: Pick<ApiRequestOptions, "signal">) => Promise<ImageGenerationResponse>;
  getImageJobResults: (jobId: number, options?: Pick<ApiRequestOptions, "signal">) => Promise<readonly ImageJobResult[]>;
}>;
```

Update options:

```ts
type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

type WaitForImageJobOptions = Readonly<{
  onJobUpdate?: JobUpdateHandler;
  signal?: AbortSignal;
  sleep?: Sleep;
}>;
```

Inside the loop:

```ts
throwIfAborted(options.signal);
const job = await api.getImageJob(jobId, { signal: options.signal });
throwIfAborted(options.signal);
options.onJobUpdate?.(job);
```

For results:

```ts
const results = await api.getImageJobResults(jobId, { signal: options.signal });
```

Add helpers:

```ts
function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("Image job polling aborted", "AbortError");
  }
}

function defaultSleep(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Image job polling aborted", "AbortError"));
    }, { once: true });
  });
}
```

**Step 4: Stabilize the workbench polling effect**

In `apps/public-web/src/features/home/generation-workbench.tsx`, derive stable values near `activeHistory`:

```ts
const activeHistoryId = activeHistory?.id ?? null;
const activeTaskId = activeHistory?.taskId ?? null;
const shouldPollActiveHistory = shouldResumeImageJobHistory(activeHistory);
```

Change the polling effect to use those values:

```ts
useEffect(() => {
  if (!activeHistoryId || !activeTaskId || !shouldPollActiveHistory) {
    return;
  }

  let active = true;
  const abortController = new AbortController();
  waitForImageJobResults(publicApi, activeTaskId, {
    signal: abortController.signal,
    onJobUpdate: (job) => {
      if (!active || job.status === "succeeded") {
        return;
      }
      completeHistory(activeHistoryId, {
        status: "generating",
        taskId: job.id,
        taskStatus: job.status,
      });
    },
  })
  // keep existing then/catch behavior, replacing activeHistory.id with activeHistoryId

  return () => {
    active = false;
    abortController.abort();
  };
}, [activeHistoryId, activeTaskId, shouldPollActiveHistory, completeHistory, failHistory]);
```

Do not depend on the whole `activeHistory` object.

**Step 5: Run focused tests**

Run:

```bash
pnpm --filter public-web test -- generation-job-polling generation-workbench-polling
```

Expected: PASS.

---

### Task 3: Avoid No-Op History Writes

**Files:**
- Modify: `apps/public-web/src/features/home/generation-history-storage.ts`
- Create: `apps/public-web/tests/generation-history-storage.test.mjs`

**Step 1: Add a failing storage test**

Create `apps/public-web/tests/generation-history-storage.test.mjs` that transpiles `generation-history-storage.ts` with TypeScript like the polling tests. Test these cases:

```js
test("updateGenerationHistory returns the same array for no-op patches", () => {
  const { updateGenerationHistory } = loadStorage();
  const histories = [buildHistory({ id: "h1", status: "generating", taskStatus: "running" })];
  const next = updateGenerationHistory(histories, "h1", {
    status: "generating",
    taskId: histories[0].taskId,
    taskStatus: "running",
  });
  assert.equal(next, histories);
  assert.equal(next[0], histories[0]);
});

test("updateGenerationHistory updates updatedAt only when values change", () => {
  const { updateGenerationHistory } = loadStorage();
  const histories = [buildHistory({ id: "h1", status: "pending", taskStatus: "queued" })];
  const next = updateGenerationHistory(histories, "h1", { status: "generating" });
  assert.notEqual(next, histories);
  assert.equal(next[0].status, "generating");
  assert.notEqual(next[0].updatedAt, histories[0].updatedAt);
});
```

**Step 2: Implement no-op detection**

In `generation-history-storage.ts`, extract patch application:

```ts
function applyHistoryPatch(
  item: GenerationHistoryItem,
  patch: GenerationHistoryUpdate,
  updatedAt: string,
): GenerationHistoryItem {
  const next = {
    ...item,
    title: patch.title?.trim() || item.title,
    prompt: patch.prompt ?? item.prompt,
    modelCode: patch.modelCode ?? item.modelCode,
    modelName: patch.modelName ?? item.modelName,
    count: patch.count ?? item.count,
    aspectRatio: patch.aspectRatio ?? item.aspectRatio,
    status: patch.status ?? item.status,
    images: patch.images ?? item.images,
    sourceImage: patch.sourceImage === undefined ? item.sourceImage : patch.sourceImage,
    referenceImages: patch.referenceImages === undefined ? item.referenceImages : patch.referenceImages,
    errorMessage: patch.errorMessage === undefined ? item.errorMessage : patch.errorMessage ?? undefined,
    taskId: patch.taskId === undefined ? item.taskId : patch.taskId ?? undefined,
    taskStatus: patch.taskStatus === undefined ? item.taskStatus : patch.taskStatus ?? undefined,
    createdAt: item.createdAt,
    updatedAt,
  };
  return isSameHistoryItem(item, next) ? item : next;
}
```

Use a small comparator that ignores `updatedAt` until a real field changes. Keep each helper under 50 lines.

Update `updateGenerationHistory` to return the original `items` array when no item changed:

```ts
const patchedItems = items.map(...);
return patchedItems.some((item, index) => item !== items[index])
  ? clampHistories(patchedItems)
  : items;
```

**Step 3: Run storage tests**

Run:

```bash
pnpm --filter public-web test -- generation-history-storage
```

Expected: PASS.

---

### Task 4: Render History Results With Thumbnails

**Files:**
- Modify: `apps/public-web/src/features/home/generation-history.types.ts`
- Modify: `apps/public-web/src/features/home/generation-job-polling.ts`
- Modify: `apps/public-web/src/features/home/generation-result-panel.tsx`
- Modify: `apps/public-web/tests/generation-result-panel-gallery.test.mjs`
- Modify: `apps/public-web/tests/generation-job-polling.test.mjs`

**Step 1: Extend the history image shape**

Add to `GenerationHistoryImage`:

```ts
thumbnailUrl?: string;
```

**Step 2: Persist thumbnail URLs from job results**

In `imageJobResultsToHistoryImages`, add:

```ts
thumbnailUrl: item.thumbnail_url ?? item.asset_url,
```

Update the existing polling test expected result to include the thumbnail when provided.

**Step 3: Use thumbnails for the result grid only**

In `generation-result-panel.tsx`, add:

```ts
function getPreviewImageUrl(image: GenerationHistoryImage) {
  if (image.thumbnailUrl) {
    return image.thumbnailUrl;
  }
  if (image.assetId) {
    return `/api/public/image/assets/${image.assetId}/thumbnail`;
  }
  return image.url;
}
```

Change the card image:

```tsx
<img
  src={getPreviewImageUrl(image)}
  alt={title}
  loading="lazy"
  decoding="async"
  sizes="(min-width: 1280px) 34vw, (min-width: 1024px) 50vw, 100vw"
/>
```

Keep preview click and download actions using `image.url`, not the thumbnail.

**Step 4: Add a source-level test for thumbnail rendering**

In `generation-result-panel-gallery.test.mjs`, assert:

```js
assert.match(source, /getPreviewImageUrl/);
assert.match(source, /thumbnailUrl/);
assert.match(source, /loading="lazy"/);
assert.match(source, /decoding="async"/);
assert.match(source, /onClick=\{\(\) => onPreview\(\{ src: image\.url, alt: title \}\)\}/);
```

**Step 5: Run focused tests**

Run:

```bash
pnpm --filter public-web test -- generation-result-panel-gallery generation-job-polling
```

Expected: PASS.

---

### Task 5: Final Verification

**Files:**
- No additional files.

**Step 1: Run all public-web tests**

Run:

```bash
pnpm --filter public-web test
```

Expected: all node tests PASS.

**Step 2: Run typecheck**

Run:

```bash
pnpm typecheck:public
```

Expected: TypeScript exits 0.

**Step 3: Manual performance verification**

Use the fixed public server on port `7700`. Seed several `generating` histories in `localStorage`, click across them, and verify in DevTools Network:

- Only the currently selected history keeps polling.
- Old job URLs stop after selection changes.
- Poll cadence is about one request per `POLL_INTERVAL_MS`.
- Selecting completed histories does not hit `/api/public/image/jobs/*`.
- Result grid image requests use `/thumbnail` for previews.

**Step 4: Check git diff**

Run:

```bash
git diff -- apps/public-web/src apps/public-web/tests
```

Expected: only the files listed in this plan changed. No unrelated UI redesign or backend behavior changes.
