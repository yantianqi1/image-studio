# Python Image Legacy

Production image execution is owned by apps/worker-go. The Python image
execution code remains only for explicit manual/test helper use and for reading
or repairing legacy rows.

## Still Kept

- FastAPI public image routes remain. They validate requests, create
  `image_jobs`, create `image_job_items`, and return queued status.
- FastAPI admin routes remain. They expose job lists, stats, dead-letter items,
  retry/cancel operations, and provider runtime controls.
- `apps/api/app/domains/image/direct_rendering.py` remains a deprecated
  development/test-only synchronous helper.
- `apps/worker/worker/tasks/image_jobs.py` remains a manual/test helper for
  legacy image work and focused tests.

## Not Production

The Python worker main loop does not import or schedule the image job module.
`WORKER_ENABLE_IMAGE_JOBS` is intentionally ignored by the worker main loop.
Production compose must not re-enable Python image execution as a hidden
fallback.

## Go Replacement

- `apps/worker-go` claims and executes `image_job_items`.
- `apps/image-api-go` can own read or create routes only behind explicit flags.
- FastAPI remains the compatibility API unless Go route flags are enabled.

## Removal Criteria

The Python image helper can be removed only after all tests, scripts, and
manual repair procedures stop importing `run_next_image_job` or
`run_next_image_jobs`. Until then, keep the code visible and explicitly
deprecated instead of adding silent fallback behavior.

## Regression Rules

- Public image creation must not call `render_job_immediately`.
- Python worker branch names must stay limited to comic task branches.
- README and production docs must recommend Go image execution only.
- Local wallet billing has been removed; do not rebuild it from legacy docs.
