from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_check_lib import parse_datetime  # noqa: E402


def test_parse_datetime_normalizes_timezone_aware_values_to_naive_utc() -> None:
    value = datetime(2026, 5, 22, 12, 30, tzinfo=timezone(timedelta(hours=8)))

    assert parse_datetime(value) == datetime(2026, 5, 22, 4, 30)
