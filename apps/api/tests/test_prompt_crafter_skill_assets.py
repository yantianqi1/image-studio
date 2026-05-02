from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SKILL_DIR = PROJECT_ROOT / ".codex" / "skills" / "gpt-image-2-prompt-crafter"


def test_prompt_crafter_skill_assets_are_present() -> None:
    skill_file = SKILL_DIR / "SKILL.md"
    patterns_file = SKILL_DIR / "references" / "prompt-patterns.md"

    assert skill_file.is_file()
    assert patterns_file.is_file()
    assert "GPT Image Prompt Crafter" in skill_file.read_text(encoding="utf-8")
    assert "Human-Subject Photography" in patterns_file.read_text(encoding="utf-8")
