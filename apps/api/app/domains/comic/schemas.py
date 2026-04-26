from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from apps.api.app.domains.comic.constants import (
    PROJECT_STATUS_DRAFT,
    TASK_STATUSES,
    TASK_TYPES,
)


class ComicProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=10000)
    genre: str = Field(default="", max_length=128)


class ComicProjectUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=10000)
    genre: str = Field(default="", max_length=128)
    status: str = Field(default=PROJECT_STATUS_DRAFT, max_length=32)


class ComicCharacterWrite(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    role: str = Field(default="", max_length=128)
    profile: str = Field(default="", max_length=10000)


class ComicCharacterBatchWrite(BaseModel):
    characters: list[ComicCharacterWrite]


class ComicChapterWrite(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    summary: str = Field(default="", max_length=10000)
    sequence: int = Field(ge=1, le=100000)


class ComicSceneWrite(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    summary: str = Field(default="", max_length=10000)
    sequence: int = Field(ge=1, le=100000)
    shots: list[str] = Field(default_factory=list)

    @field_validator("shots")
    @classmethod
    def validate_shots(cls, shots: list[str]) -> list[str]:
        cleaned_shots = [shot.strip() for shot in shots if shot.strip()]
        if len(cleaned_shots) != len(shots):
            raise ValueError("shots must not contain blank items")
        return cleaned_shots


class ComicTaskCreate(BaseModel):
    project_id: str = Field(min_length=1, max_length=64)
    chapter_id: Optional[str] = Field(default=None, max_length=64)
    scene_id: Optional[str] = Field(default=None, max_length=64)
    task_type: str = Field(min_length=1, max_length=64)
    input_payload: dict = Field(default_factory=dict)

    @field_validator("task_type")
    @classmethod
    def validate_task_type(cls, value: str) -> str:
        if value not in TASK_TYPES:
            raise ValueError("unsupported comic task type")
        return value


class ComicCharacterRead(BaseModel):
    id: str
    name: str
    role: str
    profile: str
    created_at: datetime
    updated_at: datetime


class ComicSceneRead(BaseModel):
    id: str
    title: str
    summary: str
    sequence: int
    shots: list[str]
    created_at: datetime
    updated_at: datetime


class ComicChapterRead(BaseModel):
    id: str
    title: str
    summary: str
    sequence: int
    scenes: list[ComicSceneRead]
    created_at: datetime
    updated_at: datetime


class ComicTaskRead(BaseModel):
    id: str
    project_id: str
    chapter_id: Optional[str]
    scene_id: Optional[str]
    task_type: str
    status: str
    stage: str
    progress_percent: int
    input_payload: dict
    output_payload: dict
    error_code: Optional[str]
    error_message: Optional[str]
    attempt_count: int
    max_attempts: int
    available_at: datetime
    locked_by: Optional[str]
    locked_at: Optional[datetime]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in TASK_STATUSES:
            raise ValueError("unsupported comic task status")
        return value


class ComicProjectRead(BaseModel):
    id: str
    title: str
    description: str
    genre: str
    status: str
    characters: list[ComicCharacterRead]
    chapters: list[ComicChapterRead]
    created_at: datetime
    updated_at: datetime


class ComicDeleteResult(BaseModel):
    deleted: bool
    id: str
