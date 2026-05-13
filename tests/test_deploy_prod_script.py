from pathlib import Path


DEPLOY_SCRIPT = Path(__file__).resolve().parents[1] / "scripts/deploy-prod.sh"


def test_deploy_smoke_checks_public_nginx_static_assets() -> None:
    source = DEPLOY_SCRIPT.read_text()

    assert "/brand/logo.png" in source
    assert "/_next/static/chunks/" in source
    assert "application/javascript" in source
    assert "image/png" in source
    assert "redirect: \"manual\"" in source
