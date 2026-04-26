from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class NarrativeBeat(BaseModel):
    beat_index: int = Field(ge=1)
    summary: str = Field(min_length=1)
    characters: list[str]
    visual_potential: str = Field(min_length=1)
    emotional_intensity: int = Field(ge=1, le=10)


class StoryAnalysis(BaseModel):
    title_suggestion: str = Field(min_length=1)
    genre: str = Field(min_length=1)
    tone: str = Field(min_length=1)
    plot_summary: str = Field(min_length=1)
    world_setting: dict[str, Any]
    main_conflict: str = Field(min_length=1)
    narrative_beats: list[NarrativeBeat] = Field(min_length=1)
    key_conflicts: list[Any]
    visual_motifs: list[Any]
    missing_information: list[Any]


class CharacterCardOutput(BaseModel):
    character_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1)
    role_in_story: str = Field(min_length=1)
    personality: str = Field(min_length=1)
    appearance: dict[str, Any]
    costume: dict[str, Any]
    color_palette: list[Any] = Field(min_length=1)
    must_keep_prompt: str = Field(min_length=1)
    negative_prompt: str = Field(min_length=1)
    multi_view_prompt: str = Field(min_length=1)


class CharacterBible(BaseModel):
    characters: list[CharacterCardOutput] = Field(min_length=1)

    @field_validator("characters")
    @classmethod
    def validate_unique_codes(cls, characters: list[CharacterCardOutput]) -> list[CharacterCardOutput]:
        codes = [character.character_code for character in characters]
        if len(codes) != len(set(codes)):
            raise ValueError("character_code must be unique")
        return characters


class StoryboardPanel(BaseModel):
    panel_index: int = Field(ge=1)
    scene_description: str = Field(min_length=1)
    characters: list[str]
    camera: str = Field(min_length=1)
    composition: str = Field(min_length=1)
    emotion: str = Field(min_length=1)
    dialogue: str
    sfx: str
    continuity_notes: str


class StoryboardImage(BaseModel):
    image_index: int = Field(ge=1)
    page_purpose: str = Field(min_length=1)
    panels: list[StoryboardPanel] = Field(min_length=1)


class Storyboard(BaseModel):
    style_preset: str = Field(min_length=1)
    panels_per_image: int = Field(ge=1, le=12)
    images: list[StoryboardImage] = Field(min_length=1)

    @field_validator("images")
    @classmethod
    def validate_unique_image_indexes(cls, images: list[StoryboardImage]) -> list[StoryboardImage]:
        indexes = [image.image_index for image in images]
        if len(indexes) != len(set(indexes)):
            raise ValueError("image_index must be unique")
        return images
