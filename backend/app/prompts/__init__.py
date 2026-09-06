"""LLM-промпты как отдельные текстовые файлы, не строковые константы в коде сервисов —
чтобы их можно было править/ревьюить не трогая Python (`vacancy_llm_service.py`,
`evaluation_service.py`)."""

from __future__ import annotations

from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent


def load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8").strip()
