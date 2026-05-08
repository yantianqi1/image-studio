#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PREVIEW_LIMIT = 20

sys.path.insert(0, str(REPO_ROOT))
os.chdir(REPO_ROOT)

from apps.api.app.core.config import get_settings  # noqa: E402
from apps.api.app.domains.image.storage_migration import (  # noqa: E402
    AssetStorageMigrationItem,
    migrate_local_assets_to_storage,
    plan_local_assets_to_storage,
)
from apps.api.app.infra.db.session import session_scope  # noqa: E402
from apps.api.app.infra.storage.gcs_asset_storage import GcsAssetStorage  # noqa: E402


def main() -> int:
    args = parse_args()
    settings = get_settings()
    source_root = resolve_source_root(args.source_root, default=settings.generated_assets_dir)
    bucket_name = args.bucket or settings.asset_storage_gcs_bucket
    prefix = settings.asset_storage_gcs_prefix if args.prefix is None else args.prefix

    with session_scope() as session:
        if not args.execute:
            items = plan_local_assets_to_storage(session, source_root=source_root)
            print_plan(items, bucket_name=bucket_name, prefix=prefix, preview_limit=args.preview_limit)
            return 0

        require_bucket_name(bucket_name)
        storage = GcsAssetStorage(bucket_name=bucket_name, prefix=prefix)
        result = migrate_local_assets_to_storage(session, source_root=source_root, target_storage=storage)
        print(f"migrated {result.migrated_count} assets to gs://{bucket_name}/{prefix}".rstrip("/"))
        return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload local image assets to Google Cloud Storage and rewrite assets.storage_path keys.",
    )
    parser.add_argument("--execute", action="store_true", help="write objects to GCS and update database rows")
    parser.add_argument(
        "--source-root",
        default=None,
        help="local generated-assets directory; defaults to GENERATED_ASSETS_DIR",
    )
    parser.add_argument("--bucket", default=None, help="GCS bucket name; defaults to ASSET_STORAGE_GCS_BUCKET")
    parser.add_argument("--prefix", default=None, help="GCS object key prefix; defaults to ASSET_STORAGE_GCS_PREFIX")
    parser.add_argument(
        "--preview-limit",
        type=int,
        default=DEFAULT_PREVIEW_LIMIT,
        help="dry-run item preview limit",
    )
    return parser.parse_args()


def resolve_source_root(value: str | None, *, default: str) -> Path:
    source_root = Path(value or default).resolve()
    if not source_root.is_dir():
        raise SystemExit(f"source root does not exist: {source_root}")
    return source_root


def require_bucket_name(bucket_name: str) -> None:
    if not bucket_name:
        raise SystemExit("ASSET_STORAGE_GCS_BUCKET is required for --execute")


def print_plan(
    items: tuple[AssetStorageMigrationItem, ...],
    *,
    bucket_name: str,
    prefix: str,
    preview_limit: int,
) -> None:
    target = f"gs://{bucket_name}/{prefix}".rstrip("/") if bucket_name else "GCS bucket not configured"
    limit = max(preview_limit, 0)
    print(f"dry-run: {len(items)} assets would be migrated to {target}")
    for item in items[:limit]:
        print(f"- asset {item.asset_id}: {item.source_path} -> {item.key}")
    if len(items) > limit:
        print(f"... {len(items) - limit} more assets")
    print("run again with --execute to upload files and update the database")


if __name__ == "__main__":
    raise SystemExit(main())
