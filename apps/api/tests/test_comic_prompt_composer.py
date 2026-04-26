from __future__ import annotations

from apps.api.app.domains.comic.prompt_composer import compose_panel_prompts
from apps.api.app.domains.comic.structured_outputs import CharacterBible, Storyboard


def test_prompt_composer_injects_character_must_keep_prompt() -> None:
    prompts = compose_panel_prompts(
        storyboard=build_storyboard(),
        character_bible=build_character_bible(),
        style_preset_id="baimiao",
        model_code="gpt-image-2",
    )

    assert "Consistent young swordswoman with black high ponytail" in prompts[0].prompt
    assert "[Character Anchor: Lin]" in prompts[0].prompt
    assert "Character identity lock" in prompts[0].prompt
    assert "attached reference character sheets" in prompts[0].prompt
    assert "same person in every panel" in prompts[0].prompt


def test_prompt_composer_uses_exact_panel_count_instruction() -> None:
    prompts = compose_panel_prompts(
        storyboard=build_storyboard(),
        character_bible=build_character_bible(),
        style_preset_id="baimiao",
        model_code="gpt-image-2",
    )

    assert "Create one vertical comic page containing exactly 3 clearly separated panels." in prompts[0].prompt
    assert prompts[0].panel_count == 3


def test_prompt_composer_uses_single_anchor_for_repeated_character() -> None:
    prompts = compose_panel_prompts(
        storyboard=build_storyboard(),
        character_bible=build_character_bible(),
        style_preset_id="baimiao",
        model_code="gpt-image-2",
    )

    assert prompts[0].prompt.count("[Character Anchor: Lin]") == 1
    assert prompts[0].character_codes == ["hero"]


def test_prompt_composer_injects_full_style_template_before_storyboard() -> None:
    prompts = compose_panel_prompts(
        storyboard=build_storyboard(),
        character_bible=build_character_bible(),
        style_preset_id="baimiao",
        model_code="gpt-image-2",
    )

    assert prompts[0].prompt.startswith("Task: Generate one finished vertical Chinese comic page")
    assert "Style name: Baimiao Line-art Comic" in prompts[0].prompt
    assert "no color, varied ink line weights" in prompts[0].prompt
    assert "Lin studies the haunted ferry." in prompts[0].prompt


def test_prompt_composer_supports_all_comic_style_presets() -> None:
    expected_phrases = {
        "ink_wash": "Style name: Ink Wash Comic",
        "gongbi": "Style name: Meticulous Color Comic",
        "neo_chinese": "Style name: Linear Neo-Chinese",
        "baimiao": "Style name: Baimiao Line-art Comic",
        "guochao_chibi": "Style name: Guochao Chibi Comic",
        "dark_gothic": "Style name: Dark Chinese Gothic",
        "exquisite_3d_donghua": "Style name: Exquisite 3D Donghua Style",
    }

    for style_preset_id, expected_phrase in expected_phrases.items():
        prompts = compose_panel_prompts(
            storyboard=build_storyboard(),
            character_bible=build_character_bible(),
            style_preset_id=style_preset_id,
            model_code="gpt-image-2",
        )
        assert expected_phrase in prompts[0].prompt


def test_prompt_composer_requires_chinese_visible_text() -> None:
    prompts = compose_panel_prompts(
        storyboard=build_storyboard(),
        character_bible=build_character_bible(),
        style_preset_id="neo_chinese",
        model_code="gpt-image-2",
    )

    assert "All visible text, dialogue, captions, signs, and SFX must be in Simplified Chinese" in prompts[0].prompt
    assert "Visible Chinese dialogue" in prompts[0].prompt


def build_character_bible() -> CharacterBible:
    return CharacterBible.model_validate(
        {
            "characters": [
                {
                    "character_code": "hero",
                    "name": "Lin",
                    "role_in_story": "protagonist",
                    "personality": "disciplined and compassionate",
                    "appearance": {"hair": "black high ponytail"},
                    "costume": {"silhouette": "short martial robe"},
                    "color_palette": ["ink black", "jade green"],
                    "must_keep_prompt": "Consistent young swordswoman with black high ponytail.",
                    "negative_prompt": "Do not change hairstyle or robe silhouette.",
                    "multi_view_prompt": "Character sheet, front side back views.",
                }
            ]
        }
    )


def build_storyboard() -> Storyboard:
    panel = {
        "scene_description": "Lin studies the haunted ferry.",
        "characters": ["hero"],
        "camera": "medium shot",
        "composition": "lantern light frames her face",
        "emotion": "focused",
        "dialogue": "",
        "sfx": "",
        "continuity_notes": "keep red lantern on left side",
    }
    return Storyboard.model_validate(
        {
            "style_preset": "baimiao",
            "panels_per_image": 3,
            "images": [
                {
                    "image_index": 1,
                    "page_purpose": "introduce the ferry",
                    "panels": [
                        {"panel_index": 1, **panel},
                        {"panel_index": 2, **panel},
                        {"panel_index": 3, **panel},
                    ],
                }
            ],
        }
    )
