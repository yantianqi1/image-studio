from __future__ import annotations

from importlib import import_module
from types import SimpleNamespace

MIGRATION_MODULE = "apps.api.alembic.versions.20260518_000026_remove_local_billing"


class RecordingBatchOp:
    def __init__(self, recorder: RecordingOp, table_name: str, recreate: str | None) -> None:
        self.recorder = recorder
        self.table_name = table_name
        self.recreate = recreate

    def __enter__(self) -> RecordingBatchOp:
        return self

    def __exit__(self, exc_type, exc, traceback) -> bool:
        return False

    def drop_column(self, column_name: str) -> None:
        self.recorder.batch_drop_columns.append((self.table_name, column_name, self.recreate))


class RecordingOp:
    def __init__(self, dialect_name: str) -> None:
        self.bind = SimpleNamespace(dialect=SimpleNamespace(name=dialect_name))
        self.dropped_columns: list[tuple[str, str]] = []
        self.batch_drop_columns: list[tuple[str, str, str | None]] = []

    def get_bind(self):
        return self.bind

    def drop_column(self, table_name: str, column_name: str) -> None:
        self.dropped_columns.append((table_name, column_name))

    def batch_alter_table(self, table_name: str, recreate: str | None = None) -> RecordingBatchOp:
        return RecordingBatchOp(self, table_name, recreate)


def test_removed_billing_columns_use_direct_postgres_alter(monkeypatch) -> None:
    migration = import_module(MIGRATION_MODULE)
    recorder = RecordingOp("postgresql")
    monkeypatch.setattr(migration, "op", recorder)

    migration.drop_removed_billing_columns()

    assert recorder.dropped_columns == [
        ("sellable_models", "anonymous_price_cents"),
        ("sellable_models", "member_price_cents"),
        ("image_jobs", "reservation_id"),
        ("image_jobs", "charge_cents"),
    ]
    assert recorder.batch_drop_columns == []


def test_removed_billing_columns_keep_batch_mode_for_sqlite(monkeypatch) -> None:
    migration = import_module(MIGRATION_MODULE)
    recorder = RecordingOp("sqlite")
    monkeypatch.setattr(migration, "op", recorder)

    migration.drop_removed_billing_columns()

    assert recorder.dropped_columns == []
    assert recorder.batch_drop_columns == [
        ("sellable_models", "anonymous_price_cents", "always"),
        ("sellable_models", "member_price_cents", "always"),
        ("image_jobs", "reservation_id", "always"),
        ("image_jobs", "charge_cents", "always"),
    ]
