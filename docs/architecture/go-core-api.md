# Go Core API

## Current Scope

`apps/core-api-go` is a minimal Go service skeleton for future core API work.
It currently exposes only:

- `GET /healthz`
- `GET /readyz`

`/readyz` requires `DATABASE_URL` and performs a PostgreSQL ping through the
shared `apps/image-runtime-go/pkg/db` connector.

The service returns JSON envelopes for both success and error responses:

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "service_unavailable",
    "message": "database is not ready"
  }
}
```

## Billing Boundary

Go Core does not own local wallet billing in the current architecture.

Do not add local implementations for:

- `wallets`
- `wallet_ledger`
- `wallet_reservations`
- `activation_codes`
- `model_variants`
- `image_jobs.charge_cents`
- `image_jobs.reservation_id`

Those tables and columns were removed by the NewAPI billing removal work. User
billing authority lives outside this repository in the NewAPI / main-site
layer. Recreating local reservation, activation-code, or model-variant pricing
paths would create a second source of truth.

## Provider, Quota, and Pricing Boundary

The existing Go image API already validates public create requests against the
local model/provider catalog, settings gates, client-provider config, asset
ownership, and public quota. That path creates queued image job rows only.

Go Core must not add a fake preflight or billing reservation API until the
external billing owner contract is defined. Missing internal core billing routes
should remain unavailable rather than returning mock success.
