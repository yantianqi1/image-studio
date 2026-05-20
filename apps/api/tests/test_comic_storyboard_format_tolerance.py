from __future__ import annotations

from apps.api.app.core.config import get_settings
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks

from apps.api.tests.test_comic_pipeline import (
    build_character_bible_payload,
    build_story_analysis_payload,
    build_storyboard_payload,
    create_comic_client,
    create_task,
)


def test_storyboard_images_array_uses_task_defaults(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    storyboard = build_storyboard_payload()
    outputs = {
        "StoryAnalysis": build_story_analysis_payload(),
        "CharacterBible": build_character_bible_payload(),
        "Storyboard": {"images": storyboard["images"]},
    }

    def fake_generate(*args, **kwargs) -> dict:
        return outputs[kwargs["schema_name"]]

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("OPENAI_PROVIDER_KEY", "sk-test")
    get_settings.cache_clear()
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.generate_structured_chat", fake_generate)

    processed_task_id = worker_comic_tasks.run_next_comic_task()

    get_settings.cache_clear()
    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert processed_task_id == task["id"]
    assert detail["status"] == "completed"
    assert detail["output_payload"]["style_preset"] == "baimiao"
    assert detail["output_payload"]["panels_per_image"] == 3
