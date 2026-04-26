from __future__ import annotations

import uvicorn

from apps.api.app.domains.auth.service import ensure_default_admin
from apps.api.app.infra.db.session import initialize_database, session_scope
from tests.e2e.runtime import API_PORT


def prepare_database() -> None:
    initialize_database()
    with session_scope() as session:
        ensure_default_admin(session)


def main() -> None:
    prepare_database()
    uvicorn.run(
        "apps.api.app.main:app",
        host="127.0.0.1",
        port=API_PORT,
        lifespan="off",
        log_level="info",
    )


if __name__ == "__main__":
    main()
