from pathlib import Path


DEPLOY_SCRIPT = Path(__file__).resolve().parents[1] / "scripts/deploy-prod.sh"


def test_deploy_smoke_checks_public_nginx_static_assets() -> None:
    source = DEPLOY_SCRIPT.read_text()

    assert "bash scripts/server-real-test-smoke.sh" in source
    assert "--force-recreate --no-deps nginx" in source
    assert "nginx -s reload" not in source


def test_deploy_restarts_go_image_api_before_smoke() -> None:
    source = DEPLOY_SCRIPT.read_text()

    assert "docker compose up -d --no-deps image-api-go" in source
    assert "http://127.0.0.1:7810/readyz" in source
