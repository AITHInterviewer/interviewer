"""Runtime-конфигурация evaluation-agent.

Все значения читаются из переменных окружения. Провайдер оценки выбирается через
`EVALUATION_LLM_PROVIDER`: Claude (по умолчанию), Kimi или детерминированный DummyGPT.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


class Settings:
    def __init__(self) -> None:
        self.backend_url: str = os.getenv("BACKEND_URL", "http://localhost:8000")
        self.backend_service_token: str = os.getenv("BACKEND_SERVICE_TOKEN", "dev-evaluation-token")

        self.evaluation_llm_provider: str = os.getenv("EVALUATION_LLM_PROVIDER", "claude").lower()
        self.llm_model: str = os.getenv("LLM_MODEL", "claude-sonnet-5")
        self.kimi_model: str = os.getenv("KIMI_MODEL", "kimi-k2.6")
        self.moonshot_api_key: str | None = os.getenv("MOONSHOT_API_KEY")
        # Пусто — официальный api.moonshot.ai. Заполняется, если ключ выдан
        # прокси/агрегатором (тот же паттерн, что ANTHROPIC_BASE_URL у live-agent).
        self.kimi_base_url: str | None = os.getenv("KIMI_BASE_URL")
        self.prompt_version: str = os.getenv("PROMPT_VERSION", "v1")
        self.poll_interval_seconds: float = float(os.getenv("POLL_INTERVAL_SECONDS", "5"))

        self.log_level: str = os.getenv("LOG_LEVEL", "INFO")


settings = Settings()
