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


def test_go_image_api_reads_are_disabled_by_default_and_scoped_to_get_routes() -> None:
    source = NGINX_CONFIG.read_text()

    assert "${GO_IMAGE_API_READS_ENABLED}" in source
    assert "http://image-api-go:7810" in source
    assert "~^GET:/api/public/image/jobs/[0-9]+:true:(true|false)$" in source
    assert "~^GET:/api/public/image/assets/[0-9]+/thumbnail:true:(true|false)$" in source


def test_go_image_api_create_is_disabled_by_default_and_scoped_to_job_post() -> None:
    source = NGINX_CONFIG.read_text()

    assert "${GO_IMAGE_API_CREATE_ENABLED}" in source
    assert "~^POST:/api/public/image/jobs:(true|false):true$" in source
    assert "/api/public/image/jobs/[0-9]+:(true|false):true" not in source


def test_public_proxy_strips_debug_owner_headers() -> None:
    source = NGINX_CONFIG.read_text()

    assert 'proxy_set_header X-Debug-Owner-User-ID "";' in source
    assert 'proxy_set_header X-Debug-Anonymous-Session-ID "";' in source
