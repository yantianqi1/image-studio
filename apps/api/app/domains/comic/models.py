from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.app.infra.db.base import Base

ID_LENGTH = 64
STATUS_LENGTH = 32
TASK_TYPE_LENGTH = 64


class ComicProject(Base):
    __tablename__ = "comic_projects"

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    owner_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    owner_anonymous_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("anonymous_sessions.id"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    genre: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(STATUS_LENGTH), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    characters: Mapped[list["ComicCharacter"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ComicCharacter.created_at",
    )
    chapters: Mapped[list["ComicChapter"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ComicChapter.sequence",
    )
    tasks: Mapped[list["ComicTask"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ComicTask.created_at",
    )


class ComicCharacter(Base):
    __tablename__ = "comic_characters"

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String(ID_LENGTH),
        ForeignKey("comic_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    profile: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    project: Mapped["ComicProject"] = relationship(back_populates="characters")


class ComicChapter(Base):
    __tablename__ = "comic_chapters"

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String(ID_LENGTH),
        ForeignKey("comic_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    project: Mapped["ComicProject"] = relationship(back_populates="chapters")
    scenes: Mapped[list["ComicScene"]] = relationship(
        back_populates="chapter",
        cascade="all, delete-orphan",
        order_by="ComicScene.sequence",
    )
    tasks: Mapped[list["ComicTask"]] = relationship(back_populates="chapter")


class ComicScene(Base):
    __tablename__ = "comic_scenes"

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    chapter_id: Mapped[str] = mapped_column(
        String(ID_LENGTH),
        ForeignKey("comic_chapters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    shots: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    chapter: Mapped["ComicChapter"] = relationship(back_populates="scenes")
    tasks: Mapped[list["ComicTask"]] = relationship(back_populates="scene")


class ComicTask(Base):
    __tablename__ = "comic_tasks"

    id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String(ID_LENGTH),
        ForeignKey("comic_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chapter_id: Mapped[Optional[str]] = mapped_column(
        String(ID_LENGTH),
        ForeignKey("comic_chapters.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    scene_id: Mapped[Optional[str]] = mapped_column(
        String(ID_LENGTH),
        ForeignKey("comic_scenes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    anonymous_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("anonymous_sessions.id"),
        nullable=True,
        index=True,
    )
    client_access_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    client_provider_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    request_ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    task_type: Mapped[str] = mapped_column(String(TASK_TYPE_LENGTH), nullable=False)
    status: Mapped[str] = mapped_column(String(STATUS_LENGTH), nullable=False)
    input_payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    output_payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    stage: Mapped[str] = mapped_column(String(STATUS_LENGTH), default="queued", nullable=False)
    progress_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    available_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    locked_by: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    project: Mapped["ComicProject"] = relationship(back_populates="tasks")
    chapter: Mapped[Optional["ComicChapter"]] = relationship(back_populates="tasks")
    scene: Mapped[Optional["ComicScene"]] = relationship(back_populates="tasks")


class ComicStoryAnalysis(Base):
    __tablename__ = "comic_story_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    source_text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    title_suggestion: Mapped[str] = mapped_column(String(255), nullable=False)
    genre: Mapped[str] = mapped_column(String(128), nullable=False)
    tone: Mapped[str] = mapped_column(String(128), nullable=False)
    plot_summary: Mapped[str] = mapped_column(Text, nullable=False)
    world_setting: Mapped[dict] = mapped_column(JSON, nullable=False)
    main_conflict: Mapped[str] = mapped_column(Text, nullable=False)
    narrative_beats: Mapped[list] = mapped_column(JSON, nullable=False)
    key_conflicts: Mapped[list] = mapped_column(JSON, nullable=False)
    visual_motifs: Mapped[list] = mapped_column(JSON, nullable=False)
    missing_information: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ComicCharacterCard(Base):
    __tablename__ = "comic_character_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    character_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_in_story: Mapped[str] = mapped_column(String(255), nullable=False)
    personality: Mapped[str] = mapped_column(Text, nullable=False)
    appearance: Mapped[dict] = mapped_column(JSON, nullable=False)
    costume: Mapped[dict] = mapped_column(JSON, nullable=False)
    color_palette: Mapped[list] = mapped_column(JSON, nullable=False)
    must_keep_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    negative_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    multi_view_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reference_image_job_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reference_asset_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ComicStoryboard(Base):
    __tablename__ = "comic_storyboards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    style_preset: Mapped[str] = mapped_column(String(64), nullable=False)
    panels_per_image: Mapped[int] = mapped_column(Integer, nullable=False)
    target_image_count: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ComicPanelPrompt(Base):
    __tablename__ = "comic_panel_prompts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    storyboard_id: Mapped[int] = mapped_column(Integer, ForeignKey("comic_storyboards.id", ondelete="CASCADE"), nullable=False, index=True)
    image_index: Mapped[int] = mapped_column(Integer, nullable=False)
    panel_count: Mapped[int] = mapped_column(Integer, nullable=False)
    character_codes: Mapped[list] = mapped_column(JSON, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    negative_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model_code: Mapped[str] = mapped_column(String(128), nullable=False)
    image_job_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    asset_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
