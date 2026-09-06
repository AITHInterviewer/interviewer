"""Единый клиент к OpenRouter chat/completions для backend-сервисов
(генерация вопросов вакансии и разбор интервью).

Раньше оба сервиса ходили в OpenRouter на бесплатную `minimax/minimax-m3:free` — та
стабильно отдавала 429. Потом был платный Claude через Anthropic Messages API.
На VPS один ключ OpenRouter на всё (вопросы, оценка, live, STT, TTS) — этот клиент
снова OpenRouter, модель по умолчанию `google/gemini-2.5-flash`, с ретраями на 429/5xx.

Схема ответа просится текстом в system-промпте; вызывающий валидирует pydantic-схемой.
"""

from __future__ import annotations

import asyncio
import os

import httpx

DEFAULT_MODEL = "google/gemini-2.5-flash"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

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


class OpenRouterJSONClient:
    """Один stateless POST в `/chat/completions` с ретраями на 429/5xx. `model`/`api_key`
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
        self.model = model or os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)
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
        api_key = self._api_key or os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise LLMError("OPENROUTER_API_KEY не задан — LLM-вызов недоступен.")
        base_url = (self._base_url or os.environ.get("OPENROUTER_BASE_URL", DEFAULT_BASE_URL)).rstrip(
            "/"
        )
        body = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        last_error: Exception | None = None
        for attempt in range(_MAX_ATTEMPTS):
            if attempt:
                await asyncio.sleep(_backoff_seconds(getattr(last_error, "response", None), attempt))
            try:
                response = await self._client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "HTTP-Referer": "https://github.com/AITHInterviewer/interviewer",
                        "X-Title": "ainterviewer",
                    },
                    json=body,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code in _RETRY_STATUS:
                    continue
                raise LLMError(
                    f"OpenRouter вернул {exc.response.status_code}: {exc.response.text}"
                ) from exc
            except httpx.HTTPError as exc:
                last_error = exc
                continue

            payload = response.json()
            try:
                content = payload["choices"][0]["message"]["content"]
            except (KeyError, TypeError, IndexError) as exc:
                raise LLMError(f"OpenRouter вернул неожиданный ответ: {payload}") from exc
            if not isinstance(content, str):
                raise LLMError(f"OpenRouter вернул неожиданный ответ: {payload}")
            return content

        raise LLMError(f"OpenRouter недоступен после {_MAX_ATTEMPTS} попыток: {last_error}")


# Имя, под которым сервисы/тесты создавали клиент до переезда на OpenRouter.
AnthropicJSONClient = OpenRouterJSONClient
