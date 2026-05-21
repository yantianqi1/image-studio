# Image Billing Flow

## Current Boundary

`commercial-studio` does not own local wallet billing.

Migration `20260518_000026` removed the local billing tables and image job reservation fields:

- `wallets`
- `wallet_ledger`
- `wallet_reservations`
- `image_jobs.charge_cents`
- `image_jobs.reservation_id`

The active image job flow creates local task and asset records only. User quota and billing authority live outside this repository in the NewAPI / main-site layer.

## Go Worker Responsibility

The Go image worker must not create, commit, or release local billing reservations.

On item completion it owns only:

- `image_job_items` status and retry/dead-letter fields
- generated `assets`
- `image_job_results`
- parent `image_jobs` status aggregation
- provider usage and operational error metadata when available

It should skip billing work because there is no reservation table or `reservation_id` to reconcile.

## Why Phase-6 Reservation Commit Is Not Implemented

The third-phase refactor plan mentioned committing or releasing wallet reservations from Go worker aggregation. That instruction was written for the older local-wallet architecture.

Implementing it now would require reintroducing removed schema and business ownership, which would conflict with the completed NewAPI billing removal. It would also create a fake or unreachable billing path, which is explicitly disallowed by the project debugging rules.

The current regression anchor is `apps/api/tests/test_migrations.py`, which asserts the wallet tables and image job reservation fields are absent after Alembic upgrade.
