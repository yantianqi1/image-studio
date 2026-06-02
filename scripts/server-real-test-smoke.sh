#!/usr/bin/env bash
set -euo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://nginx:80}"

require_service_running() {
  local service="$1"
  if ! docker compose ps --status running --services | grep -qx "$service"; then
    echo "required service is not running: $service" >&2
    exit 69
  fi
}

require_container_http() {
  local service="$1"
  local url="$2"
  local label="$3"
  if ! docker compose exec -T "$service" wget -qO- "$url" >/dev/null; then
    echo "required endpoint failed: $service $label $url" >&2
    exit 69
  fi
  echo "ok: $service $label"
}

require_public_runtime() {
  docker compose exec -T \
    -e PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
    public-web node - <<'NODE'
const baseUrl = process.env.PUBLIC_BASE_URL;

async function fetchText(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (response.status !== 200) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return { response, text: await response.text() };
}

function requireContentType(response, path, expected) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(expected)) {
    throw new Error(`${path} returned ${contentType || "no content-type"}`);
  }
}

async function assertPublicPageAssets() {
  const { text: html } = await fetchText("/generate");
  const chunkMatch = html.match(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/);
  if (!chunkMatch) {
    throw new Error("No /_next/static/chunks/ asset found in /generate HTML");
  }
  const chunk = await fetchText(chunkMatch[1]);
  requireContentType(chunk.response, chunkMatch[1], "application/javascript");
  const logo = await fetchText("/brand/logo.png");
  requireContentType(logo.response, "/brand/logo.png", "image/png");
}

async function assertPublicModels() {
  const { text } = await fetchText("/api/public/models");
  const payload = JSON.parse(text);
  if (!Array.isArray(payload.data)) {
    throw new Error("/api/public/models response data is not an array");
  }
  const imageModels = payload.data.filter((model) => (
    model.capability === "image" && model.public_enabled === true
  ));
  if (imageModels.length === 0) {
    throw new Error("No public image model is available for real image testing");
  }
}

(async () => {
  await fetchText("/health");
  await assertPublicPageAssets();
  await assertPublicModels();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
  echo "ok: public nginx pages/assets/models"
}

required_services=(postgres api worker worker-go image-api-go public-web admin-web nginx)
for service in "${required_services[@]}"; do
  require_service_running "$service"
done

require_container_http api http://127.0.0.1:7800/health health
require_container_http worker-go http://127.0.0.1:7900/readyz readyz
require_container_http worker-go http://127.0.0.1:7900/metrics metrics
require_container_http image-api-go http://127.0.0.1:7810/readyz readyz
require_container_http nginx http://127.0.0.1:80/health health
require_public_runtime

echo "server real-test smoke passed"
