# Image Job State Machine

This contract freezes the Phase 4 image job and item states shared by FastAPI,
Go image API, Go worker, and public-web. New states or transitions must update
this document and the image API contract tests in the same change.

## Image Job States

`image_jobs.status` is the parent job state shown to public-web and admin-web.

| State | Meaning | Terminal |
| --- | --- | --- |
| `queued` | The job has at least one item waiting for worker claim or retry. | No |
| `running` | At least one item is currently leased by a worker. | No |
| `succeeded` | Every item completed and result rows are available. | Yes |
| `failed` | At least one item failed terminally and no item is still pending. | Yes |
| `cancelled` | The user or admin cancelled the job before all items completed. | Yes |
| `partial_failed` | Optional future state for mixed success/failure when partial delivery is exposed. | Yes |

`partial_failed` is not a public-web dependency yet. A release that exposes it
must update the frontend type handling, Go and Python payload tests, and this
document together.

## Image Job Item States

`image_job_items.status` is the execution-unit state owned by the scheduler and
worker.

| State | Meaning | Terminal |
| --- | --- | --- |
| `queued` | The item is claimable when `available_at <= now()` and not blocked by scheduler policy. | No |
| `running` | The item is leased by a worker and must heartbeat before lease expiry. | No |
| `succeeded` | The item produced one asset and one result row. | Yes |
| `failed` | The item reached terminal failure. | Yes |
| `cancelled` | The item was cancelled before completion. | Yes |
| `dead_letter` | Scheduler v2 terminal failure state for manual admin recovery. | Yes |

Current compatibility note: existing code stores dead-letter visibility as
`status = 'failed'` plus a non-null `dead_letter_at`. Scheduler v2 may promote
that to the explicit `dead_letter` status. Public APIs must not treat
`dead_letter_at` as a public field.

## Parent Transition Rules

Allowed parent transitions:

| From | To | Trigger |
| --- | --- | --- |
| `queued` | `running` | Worker claims the first item. |
| `running` | `succeeded` | All items are `succeeded`. |
| `running` | `queued` | All running leases cleared and at least one item was scheduled for retry. |
| `running` | `failed` | All items are terminal and at least one item failed. |
| `queued` | `cancelled` | User or admin cancels before claim. |
| `running` | `cancelled` | User or admin cancels while work is in flight. |
| `failed` | `queued` | Manual retry requeues failed/dead-letter items. |

Invalid parent transitions must fail loudly in the service or worker layer.
Do not silently coerce an unknown state to `queued`, `failed`, or `succeeded`.

## Item Transition Rules

Allowed item transitions:

| From | To | Trigger |
| --- | --- | --- |
| `queued` | `running` | Worker claim with `FOR UPDATE SKIP LOCKED`. |
| `running` | `succeeded` | Provider render succeeds and asset/result transaction commits. |
| `running` | `queued` | Retryable failure schedules a later `available_at`. |
| `running` | `failed` | Non-retryable error or max attempts reached. |
| `running` | `dead_letter` | Scheduler v2 records terminal failure for manual recovery. |
| `queued` | `cancelled` | User or admin cancels before claim. |
| `running` | `cancelled` | User or admin cancellation wins before result commit. |
| `failed` | `queued` | Manual retry clears failure fields and increments manual retry count. |
| `dead_letter` | `queued` | Admin retry clears dead-letter fields and increments manual retry count. |

Retry transitions must preserve failure diagnostics in `last_error_code` and
`last_error_message`. Terminal failure must set `finished_at`; retry must clear
worker lock fields.

## Worker Claim Contract

Claimable items must satisfy all of the following:

- `image_job_items.status = 'queued'`
- `available_at <= now()`
- parent `image_jobs.status in ('queued', 'running')`
- the item is not in dead-letter handling
- scheduler policy does not block the owner, provider, or model

The current Go worker already ranks by item priority and owner fairness. Phase 4
scheduler v2 extends that ranking with scheduler score and provider runtime
state without changing the public job payload.

## Public Status Contract

Public clients only depend on `image_jobs.status`. Item states are internal
until the frontend partial-result API is explicitly documented.

Public-web must handle at least:

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

Unknown states must be rendered as an explicit error or neutral in-progress
state with logging. They must not be treated as success.

## Event Log

State changes are appended to `image_job_events` and mirrored to `outbox_events`.
The event log is the source for public SSE replay; current-table reads are only
used for authorization and the initial snapshot.

Core image events:

```txt
image_job.created
image_job.started
image_job.succeeded
image_job.failed
image_job.cancelled

image_job_item.started
image_job_item.succeeded
image_job_item.retry_scheduled
image_job_item.dead_lettered
image_job_item.cancelled
```

Provider circuit events are emitted through outbox:

```txt
provider.circuit_opened
provider.circuit_closed
```

## Asset Service v2

Generated assets are owned by the runtime asset layer, not by individual API or
worker implementations. The common contract is:

- storage backends implement the same key API for local and GCS
- rendered files are written to staging before final commit
- `assets.storage_path` stores the final object key
- `assets.thumbnail_storage_path` stores the derived thumbnail key when built
- `assets.size_bytes`, `assets.sha256`, `assets.width`, and `assets.height`
  are integrity metadata from the original provider bytes
- `asset.created` is emitted only after the final object commit succeeds

Operational commands live in `apps/image-runtime-go/cmd/assetctl`:

```bash
assetctl scan-orphans --dry-run
assetctl scan-orphans --execute
assetctl verify-assets --limit 1000
assetctl rebuild-thumbnails --missing-only
```

`scan-orphans` treats both `storage_path` and `thumbnail_storage_path` as live
references. A thumbnail that has a DB reference must not be deleted as an
orphan.

## Provider Usage Audit

Provider usage is recorded per rendered item in `image_provider_usage_events`.
The Go worker and Python item processor aggregate those rows onto the existing
`image_jobs.provider_*` cost and token fields in the same completion path. This
keeps public/admin payloads stable while making per-item provider usage
reconcilable.

Local wallet billing is not part of the current schema. Phase 6 reconciliation
therefore checks usage event sums against `image_jobs` and reports local billing
as removed instead of recreating wallet reservation behavior.
