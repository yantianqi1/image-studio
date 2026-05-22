# Go Image API Shadow Service

`apps/image-api-go` is an opt-in Go image API service for shadow validation and controlled route takeover. It is not a default production public entrypoint, and nginx routes to FastAPI unless explicit flags are enabled.

## Endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /api/public/image/jobs/{job_id}`
- `GET /api/public/image/jobs/{job_id}/results`
- `GET /api/public/image/jobs/{job_id}/events`
- `GET /api/public/image/gallery`
- `GET /api/public/image/assets/{asset_id}`
- `GET /api/public/image/assets/{asset_id}/thumbnail`
- `DELETE /api/public/image/jobs/{job_id}`
- `GET /api/admin/image/jobs/{job_id}/debug`
- `POST /internal/image/jobs`
- `POST /api/public/image/jobs`

Public read endpoints resolve the same cookie names as FastAPI by default:

- `studio_user_session`
- `studio_anonymous_session`

The cookie names can be overridden with:

```bash
USER_SESSION_COOKIE_NAME=studio_user_session
ANONYMOUS_SESSION_COOKIE_NAME=studio_anonymous_session
```

Debug owner headers are disabled for public read endpoints by default. They are only accepted by public reads when this explicit shadow-only flag is enabled:

```bash
GO_IMAGE_API_ENABLE_DEBUG_OWNER_HEADERS=true
```

When enabled for shadow validation, the accepted headers are:

- `X-Debug-Owner-User-ID`
- `X-Debug-Anonymous-Session-ID`

Do not enable this flag on a public route takeover. The production nginx public proxy also strips those two headers before forwarding `/api/public/*`.

Admin debug requires:

- `X-Internal-Debug-Token`

Internal create is disabled by default:

```bash
GO_IMAGE_API_ENABLE_INTERNAL_CREATE=false
```

When enabled, `POST /internal/image/jobs` creates `image_jobs` plus `image_job_items` with `source="go-shadow"` and `status="queued"`. It does not render, consume quota, or perform billing.

Public create is also disabled by default:

```bash
GO_IMAGE_API_CREATE_ENABLED=false
```

When enabled, `POST /api/public/image/jobs` resolves the same user and anonymous session cookies as FastAPI. If no owner cookie exists, it creates an anonymous session and sets `studio_anonymous_session` with the same HTTP-only, `SameSite=Lax`, path `/` shape. The Go path validates public model/provider state, settings gates (`allow_anonymous_image`, `uploads_enabled`), source/reference asset access, character-library references, client-provider headers, and public quota. It creates queued `image_jobs`, `image_job_items`, and reference rows only; rendering remains the worker's responsibility.

Local wallet billing is intentionally not implemented in Go create because the repository removed local billing tables and `image_jobs.reservation_id` / `charge_cents` in `20260518_000026_remove_local_billing.py`. Do not recreate those tables in the Go takeover path.

The SSE endpoint sends `job_snapshot` first, then status events such as `item_started`, `item_succeeded`, `item_failed`, `item_cancelled`, `item_retry_scheduled`, `job_succeeded`, `job_failed`, and `heartbeat`. The public web client tries EventSource first and falls back to existing polling on SSE error.

## Optional Read Routing

Nginx keeps routing public image reads to FastAPI by default. Each route family has its own flag:

```bash
GO_IMAGE_API_READS_ENABLED=false
GO_IMAGE_API_ASSETS_ENABLED=false
GO_IMAGE_API_SSE_ENABLED=false
GO_IMAGE_API_GALLERY_ENABLED=false
GO_IMAGE_API_DELETE_ENABLED=false
```

To route only job and result read endpoints to Go, start the Go API profile and render the nginx template with:

```bash
GO_IMAGE_API_READS_ENABLED=true docker compose --profile image-api-go up -d image-api-go nginx
```

Only these GET routes are switched by `GO_IMAGE_API_READS_ENABLED`:

- `/api/public/image/jobs/{job_id}`
- `/api/public/image/jobs/{job_id}/results`

These flags switch additional route families independently:

| Flag | Routes |
| --- | --- |
| `GO_IMAGE_API_ASSETS_ENABLED` | `GET /api/public/image/assets/{asset_id}`, `GET /api/public/image/assets/{asset_id}/thumbnail` |
| `GO_IMAGE_API_SSE_ENABLED` | `GET /api/public/image/jobs/{job_id}/events` |
| `GO_IMAGE_API_GALLERY_ENABLED` | `GET /api/public/image/gallery` |
| `GO_IMAGE_API_DELETE_ENABLED` | `DELETE /api/public/image/jobs/{job_id}` |

`GET /api/public/image/assets/{asset_id}/download`, uploads, visibility updates, and asset deletion still route to FastAPI. Rollback is setting the affected `GO_IMAGE_API_*_ENABLED=false` flag and recreating/reloading nginx.

## Optional Create Routing

Nginx keeps public image creation on FastAPI by default:

```bash
GO_IMAGE_API_CREATE_ENABLED=false
```

To route only job creation to Go, start the Go API profile and render the nginx template with:

```bash
GO_IMAGE_API_CREATE_ENABLED=true docker compose --profile image-api-go up -d image-api-go nginx
```

Only this exact route is switched:

- `POST /api/public/image/jobs`

Rollback is setting `GO_IMAGE_API_CREATE_ENABLED=false` and recreating/reloading nginx. Already queued items can continue to be consumed by the worker; the route flag only changes where new job rows are created.

## Run

```bash
docker compose --profile image-api-go up -d image-api-go
```

Local:

```bash
cd apps/image-api-go
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/image_studio \
GENERATED_ASSETS_DIR=../../generated-assets \
go run ./cmd/image-api
```

## Limits

- no nginx default route takeover
- no local wallet reservation creation
- no direct rendering inside the API request
