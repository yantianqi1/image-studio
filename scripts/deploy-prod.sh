#!/usr/bin/env bash
set -euo pipefail

assert_public_nginx_routes() {
  docker compose exec -T public-web node -e '
const BASE_URL = "http://nginx:80";

async function fetchWithoutRedirect(path) {
  return fetch(`${BASE_URL}${path}`, { redirect: "manual" });
}

function requireStatus(response, path) {
  if (response.status !== 200) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
}

function requireContentType(response, path, expected) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(expected)) {
    throw new Error(`${path} returned ${contentType || "no content-type"}`);
  }
}

(async () => {
  const page = await fetchWithoutRedirect("/generate");
  requireStatus(page, "/generate");

  const html = await page.text();
  const chunkMatch = html.match(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/);
  if (!chunkMatch) {
    throw new Error("No /_next/static/chunks/ asset found in /generate HTML");
  }

  const chunk = await fetchWithoutRedirect(chunkMatch[1]);
  requireStatus(chunk, chunkMatch[1]);
  requireContentType(chunk, chunkMatch[1], "application/javascript");

  const logo = await fetchWithoutRedirect("/brand/logo.png");
  requireStatus(logo, "/brand/logo.png");
  requireContentType(logo, "/brand/logo.png", "image/png");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'
}

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
timeout 60 sh -c 'until docker compose exec public-web node -e "require(\"http\").get(\"http://127.0.0.1:7700/\",r=>{process.exit(r.statusCode<400?0:1)}).on(\"error\",()=>process.exit(1))" 2>/dev/null; do sleep 2; done'

echo "==> Restarting admin-web (waiting for healthy)..."
docker compose up -d --no-deps admin-web
timeout 60 sh -c 'until docker compose exec admin-web node -e "require(\"http\").get(\"http://127.0.0.1:7701/\",r=>{process.exit(r.statusCode<400?0:1)}).on(\"error\",()=>process.exit(1))" 2>/dev/null; do sleep 2; done'

echo "==> Recreating nginx (remounting config)..."
docker compose up -d --force-recreate --no-deps nginx
timeout 60 sh -c 'until docker compose exec nginx wget -qO- http://127.0.0.1:80/health >/dev/null 2>&1; do sleep 2; done'

echo "==> Verifying public nginx routes..."
assert_public_nginx_routes

echo "==> Deploy complete"
docker compose ps
