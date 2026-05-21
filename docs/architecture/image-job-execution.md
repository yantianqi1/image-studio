# Image Job Execution

## Responsibilities

FastAPI owns request handling:

- create `image_jobs`
- create `image_job_items`
- validate ownership, model/provider, uploads, quota, and admin reads
- expose public/admin query APIs

Go worker owns image execution:

- claim queued `image_job_items`
- render exactly one result per item
- heartbeat running leases
- write generated assets
- complete item state
- aggregate parent `image_jobs` status

Python worker owns comic execution:

- `comic-task`
- `comic-orchestration`

The Python image job executor is legacy/manual/test-only. Its branch is gated by `WORKER_ENABLE_IMAGE_JOBS=false` by default.

## Data Model

`image_jobs` is the parent task. It stores prompt, owner, model/provider selection, visibility, requested count, status, and aggregate timing/error fields.

`image_job_items` is the execution unit. Each row has a `result_index`, claim lease fields, retry fields, and an optional `asset_id` after success.

`image_job_results` links each parent job and result index to the generated asset. `(job_id, result_index)` is unique.

`assets` stores file ownership, visibility, MIME type, and `storage_path`.

## State Aggregation

The Go worker updates parent status from item states:

- any running item keeps the parent `running`
- all items succeeded makes the parent `succeeded`
- all items finished with at least one failed item makes the parent `failed`
- queued/retryable items keep the parent claimable

Public job creation must not call `render_job_immediately`. That synchronous path is kept for development/tests only.
