# Go Core API Scope

`apps/core-api-go` stays in the repository as a minimal internal-service
skeleton. It is not a production billing, wallet, redeem, pricing, or image
execution owner today.

## Current Endpoints

The current service exposes only:

- `GET /healthz`
- `GET /readyz`

`/readyz` checks `DATABASE_URL` through the shared Go runtime DB connector. Any
other route must remain unavailable until its current-schema contract exists and
has route-specific tests.

## Removed Responsibilities

Do not rebuild these removed local modules in Go Core:

- local wallet tables or ledger flows
- local reservation or charge flows
- activation code or redeem flows
- deleted `model_variants` pricing state
- `image_jobs.reservation_id`
- `image_jobs.charge_cents`

Migration `20260518_000026_remove_local_billing.py` and the current migration
tests prove these tables and columns are not part of the active schema. Adding a
Go endpoint that depends on them would recreate a second billing source of
truth.

## Allowed Responsibilities

Go Core may grow only around current-schema, explicitly tested internal
contracts:

- health and readiness
- internal auth helper behavior
- provider/runtime read-only aggregation
- quota helper behavior when it uses existing `site_settings` and
  `public_quota_*` tables
- future admin ops aggregation that reads current control-plane tables

These additions need explicit route flags or deployment ownership, tests against
the active migrations, and rollback instructions before they are enabled.

## Other Owners

FastAPI remains responsible for admin settings, audit logs, public quota
consumption, user/session auth, and public image compatibility routes unless a
specific Go service route is cut over.

`apps/image-api-go` owns only gated image read/create route families. It
validates public create requests and creates queued `image_jobs`,
`image_job_items`, references, events, and quota usage; it does not render images
or recreate local billing.

`apps/worker-go` owns image execution by claiming `image_job_items` and writing
results/assets. Long-running image work must not move into Go Core.

## Expansion Gate

Do not add fake or placeholder success endpoints to Go Core. If a route is not
implemented against the active schema, return the existing JSON `not_found` or a
future explicit unavailable error. Expand Go Core only when the owner contract,
schema, tests, deployment flag, and rollback path are all defined.
