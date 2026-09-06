"""Единый клиент к Anthropic Messages API для backend-сервисов (генерация вопросов
вакансии и разбор интервью).

Раньше оба сервиса ходили в OpenRouter на бесплатную `minimax/minimax-m3:free` — та
стабильно отдавала 429 (в т.ч. посреди боевого разбора, из-за чего интервью навсегда
оставалось в `report_processing` без `report_json`, см. `interview_event_service._run_evaluation`).
Переходим на платный Claude через тот же `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`, что уже
используются в `live-agent/src/ainterviewer/llm_client.py:AnthropicAPILiveControlLLM` (это
может быть и Anthropic-совместимый прокси, не сам api.anthropic.com — тот же механизм, что
`ANTHROPIC_BASE_URL` в Claude Code).

У Anthropic нет `response_format: json_object` — как и раньше с OpenRouter, схема ответа
просится текстом в system-промпте, а вызывающий валидирует результат своей pydantic-схемой.
"""

from __future__ import annotations

import asyncio
import os

import httpx

DEFAULT_MODEL = "claude-haiku-4-5"
DEFAULT_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"

_MAX_ATTEMPTS = 4
_RETRY_STATUS = {429, 500, 502, 503, 529}
_MAX_BACKOFF_SEC = 30.0


class LLMError(Exception):
    """LLM недоступен или вернул невалидный ответ (сеть/429/битый JSON-конверт)."""


def _backoff_seconds(response: httpx.Response | None, attempt: int) -> float:
    """`Retry-After` в секундах, если сервер его прислал; иначе экспонента с потолком."""
    if response is not None:
        try:
            return min(float(response.headers["retry-after"]), _MAX_BACKOFF_SEC)
        except (KeyError, ValueError):
            pass
    return min(2.0**attempt, _MAX_BACKOFF_SEC)


class AnthropicJSONClient:
    """Один stateless POST в `/v1/messages` с ретраями на 429/5xx. `model`/`api_key`
    можно задать явно (тесты), иначе — из окружения при первом вызове (не в конструкторе:
    сервисы создаются и на запросах, которые LLM не трогают)."""

    def __init__(
        self,
        *,
        model: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
        self._api_key = api_key
        self._base_url = base_url
        self._client = httpx.AsyncClient(timeout=timeout)

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> str:
        api_key = self._api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise LLMError("ANTHROPIC_API_KEY не задан — LLM-вызов недоступен.")
        base_url = (self._base_url or os.environ.get("ANTHROPIC_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        body = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }

        last_error: Exception | None = None
        for attempt in range(_MAX_ATTEMPTS):
            if attempt:
                await asyncio.sleep(_backoff_seconds(getattr(last_error, "response", None), attempt))
            try:
                response = await self._client.post(
                    f"{base_url}/v1/messages",
                    headers={"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION},
                    json=body,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code in _RETRY_STATUS:
                    continue
                raise LLMError(
                    f"Anthropic вернул {exc.response.status_code}: {exc.response.text}"
                ) from exc
            except httpx.HTTPError as exc:
                last_error = exc
                continue

            payload = response.json()
            try:
                return "".join(
                    block["text"] for block in payload["content"] if block.get("type") == "text"
                )
            except (KeyError, TypeError) as exc:
                raise LLMError(f"Anthropic вернул неожиданный ответ: {payload}") from exc

        raise LLMError(f"Anthropic недоступен после {_MAX_ATTEMPTS} попыток: {last_error}")
