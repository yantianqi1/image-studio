#!/usr/bin/env bash
set -euo pipefail

READY_TIMEOUT_SECONDS=60
READY_HTTP_TIMEOUT_SECONDS=2
READY_POLL_SECONDS=2

echo "==> Pulling latest images..."
docker compose pull

echo "==> Restarting api (waiting for healthy)..."
docker compose up -d --no-deps api
docker compose exec -T \
  -e READY_TIMEOUT_SECONDS="$READY_TIMEOUT_SECONDS" \
  -e READY_HTTP_TIMEOUT_SECONDS="$READY_HTTP_TIMEOUT_SECONDS" \
  api python - <<'PY'
import os
import time
import urllib.request

ready_timeout_seconds = int(os.environ["READY_TIMEOUT_SECONDS"])
ready_http_timeout_seconds = int(os.environ["READY_HTTP_TIMEOUT_SECONDS"])

for _ in range(ready_timeout_seconds):
    try:
        urllib.request.urlopen(
            "http://127.0.0.1:7800/health",
            timeout=ready_http_timeout_seconds,
        ).read()
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit("api failed to become healthy")
PY

echo "==> Restarting worker..."
docker compose up -d --no-deps worker

echo "==> Restarting worker-go (waiting for ready)..."
docker compose up -d --no-deps worker-go
timeout "$READY_TIMEOUT_SECONDS" sh -c 'until docker compose exec worker-go wget -qO- http://127.0.0.1:7900/readyz >/dev/null 2>&1; do sleep "$1"; done' sh "$READY_POLL_SECONDS"

echo "==> Restarting image-api-go (waiting for ready)..."
docker compose up -d --no-deps image-api-go
timeout "$READY_TIMEOUT_SECONDS" sh -c 'until docker compose exec image-api-go wget -qO- http://127.0.0.1:7810/readyz >/dev/null 2>&1; do sleep "$1"; done' sh "$READY_POLL_SECONDS"

echo "==> Restarting public-web (waiting for healthy)..."
docker compose up -d --no-deps public-web
timeout "$READY_TIMEOUT_SECONDS" sh -c 'until docker compose exec public-web node -e "require(\"http\").get(\"http://127.0.0.1:7700/\",r=>{process.exit(r.statusCode<400?0:1)}).on(\"error\",()=>process.exit(1))" 2>/dev/null; do sleep "$1"; done' sh "$READY_POLL_SECONDS"

echo "==> Restarting admin-web (waiting for healthy)..."
docker compose up -d --no-deps admin-web
timeout "$READY_TIMEOUT_SECONDS" sh -c 'until docker compose exec admin-web node -e "require(\"http\").get(\"http://127.0.0.1:7701/\",r=>{process.exit(r.statusCode<400?0:1)}).on(\"error\",()=>process.exit(1))" 2>/dev/null; do sleep "$1"; done' sh "$READY_POLL_SECONDS"

echo "==> Recreating nginx (remounting config)..."
docker compose up -d --force-recreate --no-deps nginx
timeout "$READY_TIMEOUT_SECONDS" sh -c 'until docker compose exec nginx wget -qO- http://127.0.0.1:80/health >/dev/null 2>&1; do sleep "$1"; done' sh "$READY_POLL_SECONDS"

echo "==> Verifying public nginx routes..."
bash scripts/server-real-test-smoke.sh

echo "==> Deploy complete"
docker compose ps
