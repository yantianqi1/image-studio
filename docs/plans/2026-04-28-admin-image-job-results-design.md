# Admin Image Job Results Design

## Goal

Allow logged-in administrators to inspect every image generation job from the admin UI, including the full submitted prompt, generated result images, revised prompts, provider request ids, and failures.

## Recommended Approach

Extend the existing admin image job list response instead of adding a separate detail endpoint. The admin page already loads `/api/admin/image/jobs`; adding `results` to each row keeps the UI close to the current task-log style and avoids extra client state for per-row detail requests.

Result image URLs must use a new admin-only asset route. The existing public asset route enforces user or anonymous ownership and should not learn administrator bypass behavior.

## Backend Design

- Add `GET /api/admin/image/assets/{asset_id}` in the image domain.
- Keep authorization explicit with `require_admin(request, session)`.
- Return the image file with `FileResponse(Path(asset.storage_path), media_type=asset.mime_type)`.
- Add repository helpers for administrator use:
  - `get_asset(session, asset_id)` already exists and is enough for the admin asset route.
  - Add a batch result query for job ids to avoid one SQL query per job.
- Extend admin job payloads with `results`.
- Result payloads returned from admin routes must use `/api/admin/image/assets/{asset_id}`.

Failures remain visible. Missing asset rows return `image_job_not_found` or `asset_not_found` style errors through existing error handling. Missing files are not replaced with placeholders.

## Frontend Design

- Update `ImageJobsPage` to render jobs as expandable rows.
- Collapsed rows show id, status, source, model, timestamp, and a prompt summary.
- Expanded rows show:
  - full prompt,
  - error code and error message when present,
  - result images,
  - revised prompt and provider request id per result.
- Result images use ordinary `<img>` tags against the admin asset URL so the admin cookie is sent to the rewritten API path.
- Empty result sets show explicit text instead of pretending a result exists.

## Testing

- Add a backend test proving admin job list payload includes result rows with admin asset URLs.
- Add a backend test proving a logged-in admin can read another user's generated asset through `/api/admin/image/assets/{asset_id}`.
- Verify `apps/api/tests/test_image_jobs.py` with a 60-second timeout.
- Verify admin TypeScript and build after frontend changes.
