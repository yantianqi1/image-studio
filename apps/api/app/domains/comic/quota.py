from __future__ import annotations

from sqlalchemy.orm import Session

from apps.api.app.domains.comic.models import ComicTask
from apps.api.app.domains.public_quota.constants import PUBLIC_QUOTA_FEATURE_COMIC
from apps.api.app.domains.public_quota.service import consume_public_quota_by_request_ip_hash


def consume_public_quota_for_comic_image_job(
    session: Session,
    *,
    task: ComicTask,
    request_ip_hash: str | None,
    reference_type: str,
    reference_id: str,
) -> None:
    if task.user_id is not None or task.client_provider_config:
        return
    consume_public_quota_by_request_ip_hash(
        session,
        request_ip_hash=request_ip_hash,
        feature=PUBLIC_QUOTA_FEATURE_COMIC,
        reference_type=reference_type,
        reference_id=reference_id,
    )
