from pathlib import Path


EXPECTED_UPLOAD_BODY_LIMIT = "50m"
PAYLOAD_TOO_LARGE_CODE = '"code":"payload_too_large"'
NGINX_CONFIG = Path(__file__).resolve().parents[1] / "infra/nginx/nginx.prod.conf"
API_PROXY_COUNT = 4
PUBLIC_WEB_PROXY_COUNT = 2
ADMIN_WEB_PROXY_COUNT = 2


def test_nginx_entrypoints_raise_upload_body_limit() -> None:
    source = NGINX_CONFIG.read_text()

    assert source.count(f"client_max_body_size {EXPECTED_UPLOAD_BODY_LIMIT};") == 2


def test_nginx_payload_too_large_response_is_json() -> None:
    source = NGINX_CONFIG.read_text()

    assert source.count("default_type application/json;") == 2
    assert source.count(PAYLOAD_TOO_LARGE_CODE) == 2
    assert source.count("return 413") == 2


def test_variable_proxy_pass_preserves_request_uri() -> None:
    source = NGINX_CONFIG.read_text()

    assert source.count("proxy_pass $public_api_upstream;") == 1
    assert source.count("proxy_pass $upstream_api;") == API_PROXY_COUNT - 1
    assert source.count("proxy_pass $upstream_public_web;") == PUBLIC_WEB_PROXY_COUNT
    assert source.count("proxy_pass $upstream_admin_web;") == ADMIN_WEB_PROXY_COUNT


def test_nginx_access_log_records_public_api_upstream_for_cutover_evidence() -> None:
    source = NGINX_CONFIG.read_text()

    assert "log_format commercial_studio_upstream" in source
    assert 'route_upstream="$public_api_upstream"' in source
    assert 'upstream_addr="$upstream_addr"' in source
    assert "access_log /var/log/nginx/access.log commercial_studio_upstream;" in source


def test_go_image_api_reads_are_disabled_by_default_and_scoped_to_get_routes() -> None:
    source = NGINX_CONFIG.read_text()

    assert "${GO_IMAGE_API_READS_ENABLED}" in source
    assert "http://image-api-go:7810" in source
    assert "~^GET:/api/public/image/jobs/[0-9]+:true:(true|false):(true|false):" in source
    assert "~^GET:/api/public/image/jobs/[0-9]+/results:true:(true|false):(true|false):" in source
    assert "GO_IMAGE_API_READS_ENABLED}" in source
    assert "GO_IMAGE_API_ASSETS_ENABLED}" in source
    assert "GO_IMAGE_API_SSE_ENABLED}" in source


def test_go_image_api_asset_routes_have_independent_flag() -> None:
    source = NGINX_CONFIG.read_text()

    assert "${GO_IMAGE_API_ASSETS_ENABLED}" in source
    assert "~^GET:/api/public/image/assets/[0-9]+:(true|false):true:" in source
    assert "~^GET:/api/public/image/assets/[0-9]+/thumbnail:(true|false):true:" in source
    assert "~^GET:/api/public/image/assets/[0-9]+/download:(true|false):true:" not in source


def test_go_image_api_sse_and_gallery_routes_have_independent_flags() -> None:
    source = NGINX_CONFIG.read_text()

    assert "${GO_IMAGE_API_SSE_ENABLED}" in source
    assert "~^GET:/api/public/image/jobs/[0-9]+/events:(true|false):(true|false):true:" in source
    assert "~^GET:/api/public/image/gallery:(true|false):(true|false):(true|false):true:" in source


def test_go_image_api_create_is_disabled_by_default_and_scoped_to_job_post() -> None:
    source = NGINX_CONFIG.read_text()

    assert "${GO_IMAGE_API_CREATE_ENABLED}" in source
    assert "~^POST:/api/public/image/jobs:(true|false):(true|false):(true|false):(true|false):(true|false):true$" in source
    assert "/api/public/image/jobs/[0-9]+:(true|false):true" not in source


def test_go_image_api_delete_is_disabled_by_default_and_scoped_to_job_delete() -> None:
    source = NGINX_CONFIG.read_text()

    assert "${GO_IMAGE_API_DELETE_ENABLED}" in source
    assert "~^DELETE:/api/public/image/jobs/[0-9]+:(true|false):(true|false):(true|false):(true|false):true:" in source
    assert "/api/public/image/assets/[0-9]+:(true|false):(true|false):(true|false):(true|false):true" not in source


def test_public_proxy_strips_debug_owner_headers() -> None:
    source = NGINX_CONFIG.read_text()
    public_block = source.split("location /api/public/ {", 1)[1].split("}", 1)[0]

    assert 'proxy_set_header X-Debug-Owner-User-ID "";' in public_block
    assert 'proxy_set_header X-Debug-Anonymous-Session-ID "";' in public_block
