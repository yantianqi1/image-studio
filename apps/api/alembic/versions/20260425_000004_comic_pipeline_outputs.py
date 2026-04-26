"""add comic pipeline output tables

Revision ID: 20260425_000004
Revises: 20260425_000003
Create Date: 2026-04-25 00:00:04
"""

from alembic import op
import sqlalchemy as sa

revision = "20260425_000004"
down_revision = "20260425_000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    create_story_analyses()
    create_character_cards()
    create_storyboards()
    create_panel_prompts()


def downgrade() -> None:
    op.drop_table("comic_panel_prompts")
    op.drop_table("comic_storyboards")
    op.drop_table("comic_character_cards")
    op.drop_table("comic_story_analyses")


def create_story_analyses() -> None:
    op.create_table(
        "comic_story_analyses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.String(length=64), sa.ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_text_hash", sa.String(length=64), nullable=False),
        sa.Column("title_suggestion", sa.String(length=255), nullable=False),
        sa.Column("genre", sa.String(length=128), nullable=False),
        sa.Column("tone", sa.String(length=128), nullable=False),
        sa.Column("plot_summary", sa.Text(), nullable=False),
        sa.Column("world_setting", sa.JSON(), nullable=False),
        sa.Column("main_conflict", sa.Text(), nullable=False),
        sa.Column("narrative_beats", sa.JSON(), nullable=False),
        sa.Column("key_conflicts", sa.JSON(), nullable=False),
        sa.Column("visual_motifs", sa.JSON(), nullable=False),
        sa.Column("missing_information", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_story_analyses_project_id", "comic_story_analyses", ["project_id"])
    op.create_index("ix_comic_story_analyses_task_id", "comic_story_analyses", ["task_id"])


def create_character_cards() -> None:
    op.create_table(
        "comic_character_cards",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.String(length=64), sa.ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("character_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("role_in_story", sa.String(length=255), nullable=False),
        sa.Column("personality", sa.Text(), nullable=False),
        sa.Column("appearance", sa.JSON(), nullable=False),
        sa.Column("costume", sa.JSON(), nullable=False),
        sa.Column("color_palette", sa.JSON(), nullable=False),
        sa.Column("must_keep_prompt", sa.Text(), nullable=False),
        sa.Column("negative_prompt", sa.Text(), nullable=False),
        sa.Column("multi_view_prompt", sa.Text(), nullable=False),
        sa.Column("reference_image_job_id", sa.Integer(), nullable=True),
        sa.Column("reference_asset_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_character_cards_project_id", "comic_character_cards", ["project_id"])
    op.create_index("ix_comic_character_cards_task_id", "comic_character_cards", ["task_id"])
    op.create_index("ix_comic_character_cards_character_code", "comic_character_cards", ["character_code"])


def create_storyboards() -> None:
    op.create_table(
        "comic_storyboards",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.String(length=64), sa.ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("style_preset", sa.String(length=64), nullable=False),
        sa.Column("panels_per_image", sa.Integer(), nullable=False),
        sa.Column("target_image_count", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_storyboards_project_id", "comic_storyboards", ["project_id"])
    op.create_index("ix_comic_storyboards_task_id", "comic_storyboards", ["task_id"])


def create_panel_prompts() -> None:
    op.create_table(
        "comic_panel_prompts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("comic_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.String(length=64), sa.ForeignKey("comic_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storyboard_id", sa.Integer(), sa.ForeignKey("comic_storyboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_index", sa.Integer(), nullable=False),
        sa.Column("panel_count", sa.Integer(), nullable=False),
        sa.Column("character_codes", sa.JSON(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("negative_prompt", sa.Text(), nullable=False),
        sa.Column("model_code", sa.String(length=128), nullable=False),
        sa.Column("image_job_id", sa.Integer(), nullable=True),
        sa.Column("asset_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comic_panel_prompts_project_id", "comic_panel_prompts", ["project_id"])
    op.create_index("ix_comic_panel_prompts_task_id", "comic_panel_prompts", ["task_id"])
    op.create_index("ix_comic_panel_prompts_storyboard_id", "comic_panel_prompts", ["storyboard_id"])
