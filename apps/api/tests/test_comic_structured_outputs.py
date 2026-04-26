from __future__ import annotations

import pytest
from pydantic import ValidationError

from apps.api.app.domains.comic.structured_outputs import CharacterBible, StoryAnalysis, Storyboard


def test_story_analysis_schema_accepts_valid_payload() -> None:
    analysis = StoryAnalysis.model_validate(build_story_analysis_payload())

    assert analysis.title_suggestion == "River Blade"
    assert analysis.narrative_beats[0].beat_index == 1


def test_character_bible_schema_accepts_valid_payload() -> None:
    bible = CharacterBible.model_validate(build_character_bible_payload())

    assert bible.characters[0].character_code == "hero"
    assert bible.characters[0].must_keep_prompt.startswith("Consistent young swordswoman")


def test_storyboard_schema_accepts_valid_payload() -> None:
    storyboard = Storyboard.model_validate(build_storyboard_payload())

    assert storyboard.panels_per_image == 3
    assert storyboard.images[0].panels[0].characters == ["hero"]


def test_storyboard_schema_rejects_missing_panel_fields() -> None:
    payload = build_storyboard_payload()
    del payload["images"][0]["panels"][0]["camera"]

    with pytest.raises(ValidationError):
        Storyboard.model_validate(payload)


def build_story_analysis_payload() -> dict:
    return {
        "title_suggestion": "River Blade",
        "genre": "wuxia",
        "tone": "solemn",
        "plot_summary": "A swordswoman crosses a haunted river.",
        "world_setting": {"era": "mythic", "suggestion": "misty border town"},
        "main_conflict": "She must choose duty or mercy.",
        "narrative_beats": [
            {
                "beat_index": 1,
                "summary": "The hero reaches the ferry.",
                "characters": ["hero"],
                "visual_potential": "fog, lanterns, ripples",
                "emotional_intensity": 7,
            }
        ],
        "key_conflicts": ["duty versus mercy"],
        "visual_motifs": ["red lantern"],
        "missing_information": [],
    }


def build_character_bible_payload() -> dict:
    return {
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


def build_storyboard_payload() -> dict:
    return {
        "style_preset": "baimiao",
        "panels_per_image": 3,
        "images": [
            {
                "image_index": 1,
                "page_purpose": "establish ferry crossing",
                "panels": [
                    {
                        "panel_index": 1,
                        "scene_description": "Lin steps onto the old ferry.",
                        "characters": ["hero"],
                        "camera": "wide shot",
                        "composition": "river fills the background",
                        "emotion": "tense",
                        "dialogue": "",
                        "sfx": "creak",
                        "continuity_notes": "red lantern remains on left side",
                    }
                ],
            }
        ],
    }
