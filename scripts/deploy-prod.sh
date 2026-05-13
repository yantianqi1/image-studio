#!/usr/bin/env bash
set -euo pipefail

echo "==> Pulling latest images..."
docker compose pull

echo "==> Restarting api (waiting for healthy)..."
docker compose up -d --no-deps api
docker compose exec api python -c "
import time, urllib.request
for i in range(60):
    try:
        urllib.request.urlopen('http://127.0.0.1:7800/health', timeout=2).read()
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit('api failed to become healthy')
"

echo "==> Restarting worker..."
docker compose up -d --no-deps worker

echo "==> Restarting public-web (waiting for healthy)..."
docker compose up -d --no-deps public-web
timeout 60 sh -c 'until docker compose exec public-web wget -qO- http://127.0.0.1:7700/ 2>/dev/null; do sleep 1; done'

echo "==> Restarting admin-web (waiting for healthy)..."
docker compose up -d --no-deps admin-web
timeout 60 sh -c 'until docker compose exec admin-web wget -qO- http://127.0.0.1:7701/ 2>/dev/null; do sleep 1; done'

echo "==> Reloading nginx config..."
docker compose exec nginx nginx -s reload

echo "==> Deploy complete"
docker compose ps
