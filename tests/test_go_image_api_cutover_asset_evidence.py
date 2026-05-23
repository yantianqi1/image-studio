from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from go_image_api_cutover_evidence import asset_counts_from_verify  # noqa: E402


def test_asset_verify_counts_reject_duplicate_summary_values(tmp_path) -> None:
    asset_verify = tmp_path / "assetctl.out"
    asset_verify.write_text(
        "assets checked=10 missing=0 mismatched=0\nassets checked=10 missing=1 mismatched=0\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="invalid asset verify evidence"):
        asset_counts_from_verify(asset_verify)


@pytest.mark.parametrize(
    "asset_verify_text",
    [
        "assets missing=0 mismatched=0\n",
        "assets checked=0 missing=0 mismatched=0\n",
        "assets checked=10 mismatched=0\n",
        "assets checked=10 missing=0\n",
    ],
)
def test_asset_verify_counts_reject_incomplete_summary_counts(tmp_path, asset_verify_text: str) -> None:
    asset_verify = tmp_path / "assetctl.out"
    asset_verify.write_text(asset_verify_text, encoding="utf-8")

    with pytest.raises(ValueError, match="invalid asset verify evidence"):
        asset_counts_from_verify(asset_verify)


@pytest.mark.parametrize("marker", ["synthetic_success", "mock_pass"])
def test_asset_verify_counts_reject_placeholder_markers_with_suffixes(tmp_path, marker: str) -> None:
    asset_verify = tmp_path / "assetctl.out"
    asset_verify.write_text(f"{marker}\nassets checked=10 missing=0 mismatched=0\n", encoding="utf-8")

    with pytest.raises(ValueError, match="placeholder marker"):
        asset_counts_from_verify(asset_verify)
