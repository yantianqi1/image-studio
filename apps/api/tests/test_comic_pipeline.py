from __future__ import annotations

import threading
import time
from types import SimpleNamespace

from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import select

from apps.api.app.core.config import get_settings
from apps.api.app.core.errors import AppError
from apps.api.app.core.response import api_error
from apps.api.app.domains.comic.models import ComicPanelPrompt, ComicStoryboard
from apps.api.app.domains.comic.pipeline import build_storyboard_input, parse_pipeline_inputs, validate_storyboard_image_count
from apps.api.app.domains.comic.router import public_router
from apps.api.app.domains.comic.structured_outputs import CharacterBible, Storyboard
from apps.api.app.domains.image.models import ImageJob
from apps.api.app.infra.db.session import initialize_database, session_scope
from apps.worker.worker.tasks import comic_tasks as worker_comic_tasks


def test_real_pipeline_persists_structured_outputs(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    calls = install_llm_outputs(monkeypatch)

    processed_task_id = worker_comic_tasks.run_next_comic_task()

    assert processed_task_id == task["id"]
    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "completed"
    assert detail["output_payload"]["character_count"] == 1
    assert detail["output_payload"]["prompt_count"] == 1
    assert detail["output_payload"]["panels_per_image"] == 3
    assert [call["schema_name"] for call in calls] == ["StoryAnalysis", "CharacterBible", "Storyboard"]
    with session_scope() as session:
        prompt = session.execute(select(ComicPanelPrompt).where(ComicPanelPrompt.task_id == task["id"])).scalar_one()
        storyboard = session.execute(select(ComicStoryboard).where(ComicStoryboard.task_id == task["id"])).scalar_one()
        assert prompt.image_job_id is None
        assert "exactly 3 clearly separated panels" in prompt.prompt
        assert storyboard.panels_per_image == 3


def test_invalid_llm_schema_marks_task_failed(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)

    def invalid_output(*args, **kwargs) -> dict:
        return {"not": "valid"}

    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.generate_structured_chat", invalid_output)
    processed_task_id = worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert processed_task_id == task["id"]
    assert detail["status"] == "failed"
    assert detail["stage"] == "failed"
    assert detail["error_code"] == "comic_llm_schema_invalid"
    assert detail["error_message"]


def test_provider_error_marks_task_failed(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)

    def provider_error(*args, **kwargs) -> dict:
        raise AppError(code="provider_request_failed", message="upstream rejected", status_code=502)

    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.generate_structured_chat", provider_error)
    worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "failed"
    assert detail["error_code"] == "provider_request_failed"
    assert "upstream rejected" in detail["error_message"]


def test_unsupported_file_source_marks_task_failed(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client, input_payload={"source_type": "file", "source_text": "ignored"})
    install_llm_outputs(monkeypatch)

    worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "failed"
    assert detail["error_code"] == "unsupported_source_type"


def test_storyboard_panels_per_image_mismatch_fails_before_prompting(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    storyboard = build_storyboard_payload(panel_count=2, panels_per_image=2)
    install_llm_outputs(monkeypatch, storyboard_payload=storyboard)

    worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "failed"
    assert detail["stage"] == "failed"
    assert detail["error_code"] == "comic_llm_schema_invalid"
    assert "panels_per_image" in detail["error_message"]
    assert "expected" in detail["error_message"]
    assert "actual" in detail["error_message"]
    with session_scope() as session:
        prompts = list(session.execute(select(ComicPanelPrompt).where(ComicPanelPrompt.task_id == task["id"])).scalars())
        assert prompts == []
        assert all("exactly 2 clearly separated panels" not in prompt.prompt for prompt in prompts)


def test_storyboard_unknown_character_code_fails_before_prompting(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    storyboard = build_storyboard_payload()
    storyboard["images"][0]["panels"][0]["characters"] = ["hero", "doctor-liu"]
    install_llm_outputs(monkeypatch, storyboard_payload=storyboard)

    worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "failed"
    assert detail["error_code"] == "comic_llm_schema_invalid"
    assert "unknown storyboard character codes" in detail["error_message"]
    assert "doctor-liu" in detail["error_message"]
    with session_scope() as session:
        prompts = list(session.execute(select(ComicPanelPrompt).where(ComicPanelPrompt.task_id == task["id"])).scalars())
        assert prompts == []


def test_non_last_storyboard_image_panel_count_mismatch_fails(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client, input_payload={**build_input_payload(), "target_image_count": 2})
    install_segment_storyboard_outputs(monkeypatch, panel_counts={1: 2, 2: 2})

    worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "failed"
    assert detail["error_code"] == "comic_llm_schema_invalid"
    assert "non-last" in detail["error_message"]
    assert "expected" in detail["error_message"]


def test_last_storyboard_image_can_have_fewer_panels_but_not_more() -> None:
    from apps.api.app.domains.comic.pipeline import validate_storyboard_panel_counts
    from apps.api.app.domains.comic.structured_outputs import Storyboard

    valid_storyboard = Storyboard.model_validate(build_two_image_storyboard_payload(first_panel_count=3, last_panel_count=2))
    validate_storyboard_panel_counts(valid_storyboard, expected_panels_per_image=3)

    invalid_storyboard = Storyboard.model_validate(build_two_image_storyboard_payload(first_panel_count=3, last_panel_count=4))
    try:
        validate_storyboard_panel_counts(invalid_storyboard, expected_panels_per_image=3)
    except AppError as exc:
        assert exc.code == "comic_llm_schema_invalid"
        assert "last" in exc.message
    else:
        raise AssertionError("last image with too many panels must fail")


def test_missing_target_image_count_is_derived_from_long_story() -> None:
    task = task_stub(input_payload={"source_type": "text", "source_text": long_story_text(), "style_preset": "neo_chinese", "panels_per_image": 3})

    inputs = parse_pipeline_inputs(task)

    assert inputs.target_image_count > 1
    assert len(inputs.story_segments) == inputs.target_image_count


def test_storyboard_input_requires_one_image_per_story_segment() -> None:
    task = task_stub(input_payload={"source_type": "text", "source_text": long_story_text(), "style_preset": "neo_chinese", "panels_per_image": 3})
    inputs = parse_pipeline_inputs(task)
    analysis = analysis_stub()
    bible = bible_stub()

    payload = build_storyboard_input(inputs=inputs, analysis=analysis, bible=bible)

    assert payload["target_image_count"] == len(payload["story_segments"])
    assert "每个 story_segments 条目必须生成 exactly 1 张漫画图片" in payload["storyboard_requirements"][0]


def test_storyboard_generation_uses_three_way_segment_concurrency(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client, input_payload={**build_input_payload(), "source_text": long_story_text(), "target_image_count": 4})
    calls = install_segment_storyboard_outputs(monkeypatch)

    worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "completed"
    assert detail["output_payload"]["prompt_count"] == 4
    assert sorted(calls["storyboard_segments"]) == [1, 2, 3, 4]
    assert calls["max_storyboard_concurrency"] == 3


def test_storyboard_image_count_mismatch_fails() -> None:
    storyboard = Storyboard.model_validate(build_storyboard_payload())

    try:
        validate_storyboard_image_count(storyboard, expected_image_count=2)
    except AppError as exc:
        assert exc.code == "comic_llm_schema_invalid"
        assert "storyboard image count mismatch" in exc.message
    else:
        raise AssertionError("storyboard image count mismatch must fail")


def test_app_env_test_still_uses_local_output(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    calls: list[str] = []

    def fail_if_called(*args, **kwargs) -> dict:
        calls.append("called")
        raise AssertionError("test env must not call LLM adapter")

    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.generate_structured_chat", fail_if_called)
    worker_comic_tasks.run_next_comic_task()

    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert calls == []
    assert detail["status"] == "completed"
    assert detail["output_payload"]["local_test_output_not_llm"] is True


def test_non_test_environment_does_not_use_local_test_output(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    install_llm_outputs(monkeypatch)

    worker_comic_tasks.run_next_comic_task()

    get_settings.cache_clear()
    detail = client.get(f"/api/public/comic/tasks/{task['id']}").json()["data"]
    assert detail["status"] == "completed"
    assert "local_test_output_not_llm" not in detail["output_payload"]


def test_pipeline_does_not_create_image_jobs(monkeypatch) -> None:
    client = create_comic_client()
    task = create_task(client)
    install_llm_outputs(monkeypatch)

    worker_comic_tasks.run_next_comic_task()

    with session_scope() as session:
        prompt = session.execute(select(ComicPanelPrompt).where(ComicPanelPrompt.task_id == task["id"])).scalar_one()
        image_jobs = list(session.execute(select(ImageJob)).scalars())
        assert prompt.image_job_id is None
        assert prompt.status == "prompt_ready"
        assert image_jobs == []


def install_llm_outputs(monkeypatch, storyboard_payload: dict | None = None):
    calls: list[dict] = []
    outputs = {
        "StoryAnalysis": build_story_analysis_payload(),
        "CharacterBible": build_character_bible_payload(),
        "Storyboard": storyboard_payload or build_storyboard_payload(),
    }

    def fake_generate(*args, **kwargs) -> dict:
        calls.append(dict(kwargs))
        return outputs[kwargs["schema_name"]]

    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.generate_structured_chat", fake_generate)
    return calls


def install_segment_storyboard_outputs(monkeypatch, panel_counts: dict[int, int] | None = None) -> dict:
    lock = threading.Lock()
    calls = {"active_storyboards": 0, "max_storyboard_concurrency": 0, "storyboard_segments": []}

    def fake_generate(*args, **kwargs) -> dict:
        schema_name = kwargs["schema_name"]
        if schema_name == "StoryAnalysis":
            return build_story_analysis_payload()
        if schema_name == "CharacterBible":
            return build_character_bible_payload()
        segment_index = kwargs["user_payload"]["story_segments"][0]["segment_index"]
        with lock:
            calls["active_storyboards"] += 1
            calls["storyboard_segments"].append(segment_index)
            calls["max_storyboard_concurrency"] = max(calls["max_storyboard_concurrency"], calls["active_storyboards"])
        time.sleep(0.05)
        with lock:
            calls["active_storyboards"] -= 1
        panel_count = (panel_counts or {}).get(segment_index, 3)
        return build_storyboard_payload(panel_count=panel_count, image_index=segment_index)

    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    monkeypatch.setattr("apps.api.app.domains.llm.openai_chat.generate_structured_chat", fake_generate)
    return calls


def create_comic_client() -> TestClient:
    app = FastAPI()
    api_router = APIRouter(prefix="/api/public")
    api_router.include_router(public_router)
    app.include_router(api_router)

    @app.exception_handler(AppError)
    async def handle_app_error(_, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=api_error(code=exc.code, message=exc.message))

    initialize_database()
    return TestClient(app)


def create_task(
    client: TestClient,
    input_payload: dict | None = None,
    *,
    headers: dict[str, str] | None = None,
    include_client_provider: bool = True,
) -> dict:
    project_id = create_project(client)
    save_chapter(client, project_id)
    save_scene(client, project_id)
    request_headers = client_provider_headers() if include_client_provider else {}
    if headers:
        request_headers.update(headers)
    response = client.post(
        "/api/public/comic/tasks",
        headers=request_headers,
        json={
            "project_id": project_id,
            "chapter_id": "chapter-001",
            "scene_id": "scene-001",
            "task_type": "scene-render",
            "input_payload": input_payload or build_input_payload(),
        },
    )
    assert response.status_code == 201
    return response.json()["data"]


def create_project(client: TestClient) -> str:
    response = client.post(
        "/api/public/comic/projects",
        headers=client_provider_headers(),
        json={"title": "River Blade", "description": "Fixture", "genre": "Wuxia"},
    )
    return response.json()["data"]["id"]


def client_provider_headers() -> dict[str, str]:
    return {
        "x-client-id": "comic-pipeline-client",
        "x-client-provider-base-url": "https://comic-pipeline.example/v1",
        "x-client-provider-api-key": "sk-comic-pipeline",
    }


def save_chapter(client: TestClient, project_id: str) -> None:
    client.put(f"/api/public/comic/projects/{project_id}/chapters/chapter-001", json={"title": "Crossing", "summary": "River crossing", "sequence": 1})


def save_scene(client: TestClient, project_id: str) -> None:
    client.put(f"/api/public/comic/projects/{project_id}/chapters/chapter-001/scenes/scene-001", json={"title": "Ferry", "summary": "Ferry scene", "sequence": 1, "shots": ["wide"]})


def build_input_payload() -> dict:
    return {"source_type": "text", "source_text": "Lin reaches a haunted ferry.", "style_preset": "baimiao", "panels_per_image": 3, "target_image_count": 1}


def build_story_analysis_payload() -> dict:
    return {"title_suggestion": "River Blade", "genre": "wuxia", "tone": "solemn", "plot_summary": "Lin crosses a haunted river.", "world_setting": {"place": "misty ferry"}, "main_conflict": "duty versus mercy", "narrative_beats": [{"beat_index": 1, "summary": "Lin reaches the ferry.", "characters": ["hero"], "visual_potential": "fog and lanterns", "emotional_intensity": 7}], "key_conflicts": ["duty versus mercy"], "visual_motifs": ["red lantern"], "missing_information": []}


def build_character_bible_payload() -> dict:
    return {"characters": [{"character_code": "hero", "name": "Lin", "role_in_story": "protagonist", "personality": "disciplined", "appearance": {"hair": "black high ponytail"}, "costume": {"robe": "short martial robe"}, "color_palette": ["ink black", "jade"], "must_keep_prompt": "Consistent young swordswoman with black high ponytail.", "negative_prompt": "Do not change hairstyle.", "multi_view_prompt": "Character sheet front side back."}]}


def build_storyboard_payload(panel_count: int = 3, panels_per_image: int = 3, image_index: int = 1) -> dict:
    return {"style_preset": "baimiao", "panels_per_image": panels_per_image, "images": [{"image_index": image_index, "page_purpose": "introduce ferry", "panels": build_panels(panel_count)}]}


def build_two_image_storyboard_payload(*, first_panel_count: int, last_panel_count: int) -> dict:
    return {"style_preset": "baimiao", "panels_per_image": 3, "images": [{"image_index": 1, "page_purpose": "setup", "panels": build_panels(first_panel_count)}, {"image_index": 2, "page_purpose": "final beat", "panels": build_panels(last_panel_count)}]}


def build_panels(panel_count: int) -> list[dict]:
    panel = {"scene_description": "Lin watches the ferry lantern.", "characters": ["hero"], "camera": "medium shot", "composition": "lantern left, river behind", "emotion": "focused", "dialogue": "", "sfx": "", "continuity_notes": "red lantern stays left"}
    return [{"panel_index": index, **panel} for index in range(1, panel_count + 1)]


def task_stub(*, input_payload: dict) -> SimpleNamespace:
    return SimpleNamespace(input_payload=input_payload)


def analysis_stub() -> SimpleNamespace:
    return SimpleNamespace(
        title_suggestion="River Blade",
        genre="wuxia",
        tone="solemn",
        plot_summary="Lin crosses a haunted river.",
        world_setting={"place": "misty ferry"},
        main_conflict="duty versus mercy",
        narrative_beats=[],
        key_conflicts=[],
        visual_motifs=[],
        missing_information=[],
    )


def bible_stub() -> CharacterBible:
    return CharacterBible.model_validate(build_character_bible_payload())


def long_story_text() -> str:
    paragraph = "陈迹坐在惨白灯光下接受问诊，医生不断追问他的记忆、创伤与失控冲动。窗外秋夜沉沉，他想起十二岁那年的同桌、消失的旧物、以及那些被刻意抹平的细节。"
    return "\n".join(paragraph for _ in range(24))
