# Go Core API Runbook

Go Core API is the future internal API boundary for image preflight,
commercial checks, quota, provider catalog reads, and audit records. Current
production image execution does not depend on Go Core billing.

## Current Schema Boundary

本地 wallet billing 已移除。Do not recreate or depend on:

- local wallet tables
- reservation tables
- redeem tables
- local pricing matrices
- `image_jobs.reservation_id`

不要重建 wallet, reservation, redeem, or local pricing state as a shortcut.
If a Go Core endpoint expects those tables, keep the endpoint disabled and fix
the design against the current schema first.

## Gray Release Flags

Keep flags explicit:

```bash
GO_CORE_API_BILLING_ENABLED=false
GO_CORE_API_QUOTA_ENABLED=false
GO_IMAGE_API_READS_ENABLED=false
GO_IMAGE_API_CREATE_ENABLED=false
```

Only enable Go Core billing or quota after:

- the endpoint exists in the deployed service,
- `INTERNAL_SERVICE_TOKEN` is configured on both caller and service,
- route-specific tests pass against the current migrations,
- rollback flags are ready.

## Security Checks

- Require `X-Internal-Service-Token` or the configured internal token header.
- Reject missing token with 401 or 403.
- Do not expose pprof through public nginx routes.
- Do not log API keys, authorization headers, full prompts, or base64 images.

## Operational Checks

Use these before enabling any Core flag:

```bash
docker compose ps core-api-go api image-api-go worker-go postgres
docker compose logs --tail=200 core-api-go image-api-go api
curl -i http://127.0.0.1:7800/health
```

If Core is not deployed, leave the Core flags false. Admin pages and docs must
show unavailable state instead of mock success.

## Reconcile

billing reconcile now means provider usage consistency:

```bash
python3 scripts/reconcile-image-billing.py --dry-run
```

Expected current behavior: `local_billing=removed`. Compare
`image_provider_usage_events` with aggregated `image_jobs` provider cost fields.

## Rollback

Disable Core flags first:

```bash
GO_CORE_API_BILLING_ENABLED=false
GO_CORE_API_QUOTA_ENABLED=false
docker compose exec nginx nginx -s reload
```

Then verify public image creation still creates queued `image_jobs` and
`image_job_items`. Do not add a fallback that silently skips quota, provider
validation, or usage accounting.
