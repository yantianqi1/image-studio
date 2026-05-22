# Image API Contract

This contract applies to the public image API served by FastAPI or Go image API.
Both implementations must return the same documented success envelope and data
fields. Any public field change must update this document plus:

- `tests/contracts/image_job_payload_test.py`
- `apps/image-api-go/internal/httpapi/contract_test.go`
- frontend types that consume the changed field

## Success Envelope

JSON endpoints return:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

`data` can be an object, array, or scalar depending on the endpoint. `meta` is
an object and must be present even when empty. `error` is null on success.

## Error Envelope

FastAPI application errors return:

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "image_job_not_found",
    "message": "image job not found"
  }
}
```

Go image API routes that are already cut over should converge on the same shape.
Until every error branch is migrated, clients must rely on HTTP status first and
only read `error.code` when the response content type is JSON.

## `POST /api/public/image/jobs`

Creates a queued image job. Long running render execution must happen in the Go
worker, not inside the API request.

Request fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `prompt` | string | Yes | Prompt after frontend composition. |
| `model_code` | string | Yes | Public sellable image model code. |
| `requested_count` | integer | No | Defaults to 1. |
| `mode` | string | No | `generate` or `edit`. |
| `size` | string | No | Provider-specific size option. |
| `quality` | string | No | Provider-specific quality option. |
| `source_asset_id` | integer | No | Required by edit mode. |
| `reference_asset_ids` | array integer | No | Reference assets owned by requester. |
| `character_library_ids` | array integer | No | FastAPI expands these to references. |
| `conversation_messages` | array object | No | Multi-turn image context. |
| `visibility` | string | No | `private` or `public`. |
| `auto_title` | boolean | No | Requests async title generation. |

Response `data` is an image job object.

## Image Job Object

| Field | Type |
| --- | --- |
| `id` | integer |
| `user_id` | integer or null |
| `source` | string |
| `mode` | string |
| `title` | string or null |
| `prompt` | string |
| `model_code` | string |
| `visibility` | string |
| `source_asset_id` | integer or null |
| `provider_id` | integer or null |
| `provider_model` | string or null |
| `client_provider_base_url` | string or null |
| `status` | string |
| `requested_count` | integer |
| `attempt_count` | integer |
| `max_attempts` | integer |
| `size` | string or null |
| `quality` | string or null |
| `provider_input_tokens` | integer or null |
| `provider_output_tokens` | integer or null |
| `provider_total_tokens` | integer or null |
| `raw_provider_cost_cents` | integer or null |
| `provider_fee_cents` | integer or null |
| `internal_cost_cents` | integer or null |
| `error_code` | string or null |
| `error_message` | string or null |
| `created_at` | ISO timestamp string |
| `available_at` | ISO timestamp string |
| `started_at` | ISO timestamp string or null |
| `finished_at` | ISO timestamp string or null |

Valid public `status` values are documented in
`docs/architecture/image-job-state-machine.md`.

## `GET /api/public/image/jobs/{id}`

Returns one image job object scoped to the requester owner. A different owner
must receive 404.

## `GET /api/public/image/jobs/{id}/results`

Returns result rows ordered by `result_index` ascending.

Result object fields:

| Field | Type |
| --- | --- |
| `id` | integer |
| `job_id` | integer |
| `result_index` | integer |
| `asset_id` | integer |
| `asset_url` | string |
| `thumbnail_url` | string |
| `visibility` | string |
| `published_at` | ISO timestamp string or null |
| `created_at` | ISO timestamp string |
| `revised_prompt` | string or null |
| `provider_request_id` | string or null |

## `GET /api/public/image/jobs/{id}/items`

Returns execution-unit rows ordered by `result_index` ascending. This route is
served by FastAPI while Go image API owns the main job read/results/assets/SSE
cutover path.

Item object fields:

| Field | Type |
| --- | --- |
| `id` | integer |
| `job_id` | integer |
| `result_index` | integer |
| `status` | string |
| `asset_id` | integer or null |
| `error_code` | string or null |
| `error_message` | string or null |
| `manual_retry_count` | integer |
| `created_at` | ISO timestamp string |
| `available_at` | ISO timestamp string |
| `started_at` | ISO timestamp string or null |
| `finished_at` | ISO timestamp string or null |
| `cancelled_at` | ISO timestamp string or null |

## `POST /api/public/image/items/{item_id}/retry`

Requeues one failed, cancelled, or dead-lettered item owned by the requester.
The response `data` is the same item object as
`GET /api/public/image/jobs/{id}/items`.

## `POST /api/public/image/items/{item_id}/cancel`

Cancels one queued, running, or failed item owned by the requester. The response
`data` is the same item object as `GET /api/public/image/jobs/{id}/items`.

## `GET /api/public/image/gallery`

Returns image gallery rows ordered newest first.

Supported query parameters:

| Parameter | Values | Notes |
| --- | --- | --- |
| `scope` | `mine`, `public` | Defaults to `mine`. |

Gallery item fields:

| Field | Type |
| --- | --- |
| `asset_id` | integer |
| `asset_url` | string |
| `thumbnail_url` | string |
| `visibility` | string |
| `published_at` | ISO timestamp string or null |
| `created_at` | ISO timestamp string |
| `job_id` | integer |
| `result_index` | integer |
| `prompt` | string |
| `revised_prompt` | string or null |

## `DELETE /api/public/image/jobs/{id}`

Deletes one image job owned by the requester. Output result rows, job items,
reference rows, generated output assets, and generated thumbnails are removed
with the job. Reference input assets are not removed.

Response `data` fields:

| Field | Type |
| --- | --- |
| `deleted` | boolean |
| `id` | string |

## `GET /api/public/image/jobs/{id}/events`

Server-sent events stream job progress from `image_job_events`.

Supported replay cursors:

| Cursor | Behavior |
| --- | --- |
| `Last-Event-ID` header | Replays events with `image_job_events.id` greater than the header value |
| `since_event_id` query parameter | Same replay behavior for clients that cannot set headers |

`Last-Event-ID` takes precedence when both are present. Invalid cursor values
return `400`.

Each stored event is sent with an SSE `id:` line equal to `image_job_events.id`.
Heartbeat events do not use an event id.

Public SSE wire event names remain compatible with existing public-web clients:

| Event | Data |
| --- | --- |
| `job_snapshot` | `{ "id": number, "status": string }` |
| `item_started` | `{ "id": number, "status": "running" }` |
| `item_succeeded` | `{ "id": number, "status": "succeeded", "item_id": number, "asset_id"?: number }` |
| `item_failed` | `{ "id": number, "status": "failed", "item_id": number, "error_message"?: string }` |
| `item_cancelled` | `{ "id": number, "status": "cancelled", "item_id": number }` |
| `item_retry_scheduled` | `{ "id": number, "status": "queued", "item_id": number }` |
| `job_succeeded` | `{ "id": number, "status": "succeeded" }` |
| `job_failed` | `{ "id": number, "status": "failed" }` or `{ "error": string }` |
| `heartbeat` | `{ "job_id": number }` |

Canonical stored event types map to SSE names as follows:

| Stored `event_type` | SSE event |
| --- | --- |
| `image_job.created` | `job_snapshot` |
| `image_job.started` | `item_started` |
| `image_job_item.started` | `item_started` |
| `image_job_item.succeeded` | `item_succeeded` |
| `image_job_item.failed` | `item_failed` |
| `image_job_item.dead_lettered` | `item_failed` |
| `image_job_item.cancelled` | `item_cancelled` |
| `image_job_item.retry_scheduled` | `item_retry_scheduled` |
| `image_job.succeeded` | `job_succeeded` |
| `image_job.failed` | `job_failed` |
| `image_job.cancelled` | `job_failed` |

## `GET /api/public/image/assets/{id}`

Returns binary asset content scoped to owner or public visibility.

Required cache headers:

| Header | Value |
| --- | --- |
| `Cache-Control` | `public, max-age=86400, s-maxage=604800` |
| `CDN-Cache-Control` | `public, max-age=604800` |

## `GET /api/public/image/assets/{id}/thumbnail`

Returns binary thumbnail content with the same ownership and cache behavior as
the asset route. Raster thumbnails are JPEG. SVG assets can return SVG content.
When the Go API builds a missing raster thumbnail, it records the derived object
key in `assets.thumbnail_storage_path`.
