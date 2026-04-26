from __future__ import annotations

import pytest

from apps.api.app.core.errors import AppError
from apps.api.app.domains.comic.style_presets import DEFAULT_STYLE_PRESET_ID, normalize_style_preset_id


def test_style_preset_normalizes_supported_aliases() -> None:
    assert normalize_style_preset_id("neo_chinese") == "neo_chinese"
    assert normalize_style_preset_id("线性新国风漫画") == "neo_chinese"
    assert normalize_style_preset_id("Linear Neo-Chinese") == "neo_chinese"
    assert normalize_style_preset_id("国风3D精美动漫") == "exquisite_3d_donghua"


def test_empty_style_preset_uses_documented_default() -> None:
    assert normalize_style_preset_id("") == DEFAULT_STYLE_PRESET_ID
    assert normalize_style_preset_id(None) == DEFAULT_STYLE_PRESET_ID


def test_unknown_style_preset_fails_explicitly() -> None:
    with pytest.raises(AppError) as error:
        normalize_style_preset_id("direct")

    assert error.value.code == "comic_style_preset_invalid"
    assert "direct" in error.value.message
