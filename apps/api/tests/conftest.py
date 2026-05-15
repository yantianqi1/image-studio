from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from apps.api.app.core.config import get_settings
from apps.api.app.infra.db.session import get_engine, get_session_factory, initialize_database
from apps.api.app.main import create_app


@pytest.fixture(autouse=True)
def reset_cached_settings(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path / 'test.db'}"
    os.environ["GENERATED_ASSETS_DIR"] = str(tmp_path / "generated-assets")
    os.environ["APP_ENV"] = "test"
    os.environ["APP_VERSION"] = "0.1.0"
    os.environ["OPENAI_PROVIDER_TYPE"] = "openai-chat-compatible"
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()
    yield
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


@pytest.fixture
def client() -> TestClient:
    initialize_database()
    return TestClient(create_app())
