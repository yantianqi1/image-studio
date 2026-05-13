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

    assert source.count("proxy_pass $upstream_api;") == API_PROXY_COUNT
    assert source.count("proxy_pass $upstream_public_web;") == PUBLIC_WEB_PROXY_COUNT
    assert source.count("proxy_pass $upstream_admin_web;") == ADMIN_WEB_PROXY_COUNT
