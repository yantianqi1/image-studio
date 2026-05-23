# FastAPI Image Legacy Sunset

This document defines the final boundary for retiring FastAPI/Python image
execution. It is not a deletion plan for the current release. Go image API and
Go worker are the production image path; FastAPI image routes remain only as an
explicit fallback window.

## A. Prohibited In Production

These paths must not be used for production image execution:

- Python worker image execution in `apps/worker/worker/tasks/image_jobs.py`.
- `WORKER_ENABLE_IMAGE_JOBS`; the Python worker main loop ignores this removed
  flag and only starts comic branches.
- Synchronous public rendering through
  `apps/api/app/domains/image/direct_rendering.py`.
- Any public create path that calls `render_job_immediately`.

The public create route must create `image_jobs` and `image_job_items`, return
queued status, and let `apps/worker-go` execute render work.

## B. Temporarily Retained Fallback

These paths remain during the FastAPI fallback window:

- FastAPI public image create/read routes, for nginx rollback when
  `GO_IMAGE_API_*_ENABLED=false`.
- FastAPI public asset and events compatibility routes while Go route flags can
  be disabled independently.
- FastAPI admin image operations for job lists, stats, dead-letter items,
  retry/cancel actions, and provider runtime controls.
- Python image execution helpers for explicit manual repair and focused tests
  against legacy rows without `image_job_items`.

Fallback window: 1-2 releases after Go image API create/read are the default
production path and the cutover gate has passed.

Fallback must stay explicit. Do not route failed Go execution into Python image
execution silently.

## C. Planned Deletion

Delete these only after the fallback window closes and no supported operation
imports them:

- `apps/worker/worker/tasks/image_jobs.py`.
- `apps/api/app/domains/image/direct_rendering.py`.
- Python image execution tests that exist only for legacy helper coverage.
- Legacy documentation that describes Python image execution as a runnable
  production path.

Deletion requires a final search for `run_next_image_job`,
`run_next_image_jobs`, and `render_job_immediately`, plus a rollback note that
explains the last release still supporting FastAPI image route fallback.

## Regression Rules

- Production docs recommend Go image API plus Go worker only.
- README must not recommend the Python worker as a production fallback.
- Python worker must not register an `image-jobs` branch by default or when
  `WORKER_ENABLE_IMAGE_JOBS=true`.
- Public create route must not call `render_job_immediately`.
- Missing metrics or unsupported fallback states must remain visible as TODOs or
  explicit errors, never synthetic success.
