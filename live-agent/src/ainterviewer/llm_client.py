"""
Клиент LLM для реактивного цикла — Claude Agent SDK на подписке (решение пользователя,
не OpenRouter/OpenAI-клиент — см. обсуждение в чате: /claude-api явно требует не молчать
про использование не-Anthropic SDK, и мы явно спросили и получили ответ).

Важная оговорка по устройству: Claude Agent SDK — это харнесс Claude Code (свои тулы,
свой агентный цикл, MCP и т.д.), а не голый chat-completion. Здесь он используется
намеренно "не по специальности" — как узкий один-в-один synchronous completion:
    - `tools=[]` — все встроенные тулы (Read/Bash/...) выключены, модели нечем "агентить";
    - `max_turns=1` — ровно один ход, без диалога с самим собой;
    - `output_format={"type": "json_schema", ...}` — CLI сама валидирует и парсит ответ
      в `ResultMessage.structured_output`, не нужно вытаскивать JSON из текста руками.
Это единственный способ получить дешёвую подписочную (не токен-биллинг) авторизацию,
не тащя в граф лишнюю агентность — см. README, раздел "Как мы используем Agent SDK не по
специальности".

Модель — `claude-haiku-4-5` (решение пользователя: нужна скорость на узкой классификации
с бюджетом в единицы секунд, не intelligence-максимум).

Известный риск, подтверждённый вживую (2026-09-05, см. `ClaudeAgentSDKLiveControlLLM`
докстринг ниже): даже с переиспользованным `ClaudeSDKClient` один ход занимает 5-19
секунд — это не подключение подпроцесса (оно происходит раз на вопрос), а накладные
расходы самого CLI-харнесса Claude Code поверх инференса. При требовании ответа за
2-3 секунды (2026-09-06) это неприемлемо — добавлен `MistralLiveControlLLM` как
опциональная альтернатива на прямом REST-API (переключается `LLM_PROVIDER=mistral`,
см. `agent.py`). Дефолт остаётся Claude Agent SDK — правило 8 в CLAUDE.md описывает это
как ранее принятое решение; здесь оно не отменяется, а временно пробуется alternative
провайдер по прямому запросу пользователя.
"""

from __future__ import annotations

import asyncio
import json
import os
from abc import ABC, abstractmethod

import httpx
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
)

from .schema import Decision, GapType, LiveControlDecision

DEFAULT_MODEL = "claude-haiku-4-5"


def _parse_retry_after(value: str | None) -> float | None:
    """`Retry-After` — секунды (не HTTP-date, тот формат тут никто не отдаёт) — если
    заголовка нет или он не парсится, вызывающий сам берёт дефолтный бэкофф."""
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


class LiveControlLLM(ABC):
    @abstractmethod
    async def decide(self, system_prompt: str, turn_prompt: str) -> LiveControlDecision: ...

    async def reset(self) -> None:
        """Вызывается при входе на новый вопрос (`_enter_question()`) — реализации,
        держащие процесс/сессию между ходами, здесь её пересоздают. По умолчанию no-op
        (см. FakeLLM — там нечего пересоздавать)."""
        return None


class ClaudeAgentSDKLiveControlLLM(LiveControlLLM):
    """Реальный найденный баг (2026-09-05, живой прогон): `query()` поднимает НОВЫЙ
    subprocess `claude` CLI на каждый вызов — это и предупреждал докстринг модуля выше,
    подтверждено вживую: 20-30+ секунд на ход, ощутимо в живом звонке ("медленно как-то
    работает"). Держим один `ClaudeSDKClient` (один subprocess) на весь текущий вопрос —
    `reset()` вызывается из `state_machine._enter_question()` при входе на новый вопрос,
    переподключение происходит лениво при следующем `decide()`."""

    def __init__(self, model: str | None = None):
        self.model = model or os.environ.get("LLM_MODEL", DEFAULT_MODEL)
        self._client: ClaudeSDKClient | None = None

    async def reset(self) -> None:
        if self._client is not None:
            await self._client.disconnect()
            self._client = None

    async def _ensure_client(self, system_prompt: str) -> ClaudeSDKClient:
        if self._client is not None:
            return self._client
        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            model=self.model,
            tools=[],  # ни одного встроенного тула — только текстовый completion
            # permission_mode="bypassPermissions" — реальный найденный баг (2026-09-05):
            # транслируется CLI во флаг --dangerously-skip-permissions, а тот CLI явно
            # запрещает при root/sudo ("cannot be used with root/sudo privileges for
            # security reasons") — контейнер live-agent работает от root. tools=[] и так
            # означает, что спрашивать разрешения не на что — permission_mode можно
            # просто не задавать.
            output_format={
                "type": "json_schema",
                "schema": LiveControlDecision.model_json_schema(),
            },
        )
        client = ClaudeSDKClient(options=options)
        await client.connect()
        self._client = client
        return client

    async def decide(self, system_prompt: str, turn_prompt: str) -> LiveControlDecision:
        client = await self._ensure_client(system_prompt)
        await client.query(turn_prompt)

        result: ResultMessage | None = None
        fallback_text = ""
        async for message in client.receive_response():
            if isinstance(message, ResultMessage):
                result = message
            elif isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        fallback_text += block.text

        if result is None:
            raise RuntimeError("Claude Agent SDK не вернул ResultMessage — проверьте авторизацию (claude login).")
        if result.is_error:
            raise RuntimeError(f"Claude Agent SDK вернул ошибку: {result.subtype} / {result.errors}")

        if result.structured_output is not None:
            return LiveControlDecision.model_validate(result.structured_output)

        # На случай если CLI по какой-то причине не заполнил structured_output —
        # пробуем распарсить текстовый ответ как JSON, а не падаем молча.
        raw = result.result or fallback_text
        return LiveControlDecision.model_validate(json.loads(raw))


class _OpenAICompatibleLiveControlLLM(LiveControlLLM):
    """База для любого OpenAI-совместимого `/chat/completions` (Mistral, OpenRouter, ...)
    вместо Claude Agent SDK CLI — убирает накладные расходы харнесса (см. докстринг
    модуля): один `httpx`-запрос без подпроцесса. `response_format: json_object` не
    принимает JSON-схему (в отличие от `output_format` Claude Agent SDK или tool-use
    Anthropic) — схема ответа добавляется текстом в system prompt, а
    `LiveControlDecision.model_validate()` сам проверяет результат.

    Без сессии/подпроцесса между ходами — `reset()` не держит состояния, каждый вызов
    независим (обычный stateless HTTP-клиент).

    Реальный найденный баг вживую (2026-09-06): бесплатный тир OpenRouter отдал 429 Too
    Many Requests посреди интервью — `decide()` падал на каждом следующем ходу без
    какого-либо повтора, агент замолкал навсегда (кандидат решил, что сервис завис, и
    закрыл вкладку). `_MAX_RETRIES` попыток с бэкоффом (уважаем `Retry-After`, если
    сервер его прислал) — конечно, не решает исчерпание квоты целиком, но переживает
    короткие всплески троттлинга, не блокируя разговор на секунды дольше нужного."""

    BASE_URL: str
    _MAX_RETRIES = 2
    _RETRY_BACKOFF_SECONDS = (0.5, 1.5)

    _SCHEMA_HINT = """\

Ответь СТРОГО одним JSON-объектом, без markdown-обёртки (```), без текста до или после \
JSON, ровно с такими полями:
{
  "decision": "continue" | "exhaustive" | "ambiguous" | "gap" | "coding_done",
  "gap_type": "clarification" | "leading_hint" | "drill_down" | "coding_hint" | null,
  "utterance": "текст реплики кандидату, или null при decision=continue/exhaustive/coding_done",
  "reasoning": "короткое обоснование для протокола"
}
gap_type обязателен (не null), только если decision="gap". "coding_done"/gap_type="coding_hint" —
только в фазе решения задачи (CODING_SYSTEM_PROMPT), обычный реактивный цикл их не использует."""

    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key
        self._client = httpx.AsyncClient(timeout=20.0)

    async def decide(self, system_prompt: str, turn_prompt: str) -> LiveControlDecision:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt + self._SCHEMA_HINT},
                {"role": "user", "content": turn_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        }

        response: httpx.Response | None = None
        for attempt in range(self._MAX_RETRIES + 1):
            response = await self._client.post(
                self.BASE_URL, headers={"Authorization": f"Bearer {self.api_key}"}, json=payload
            )
            if response.status_code != 429 or attempt == self._MAX_RETRIES:
                break
            delay = _parse_retry_after(response.headers.get("retry-after")) or self._RETRY_BACKOFF_SECONDS[attempt]
            await asyncio.sleep(delay)

        assert response is not None  # цикл выполняется минимум один раз
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        return LiveControlDecision.model_validate(json.loads(raw))


class MistralLiveControlLLM(_OpenAICompatibleLiveControlLLM):
    BASE_URL = "https://api.mistral.ai/v1/chat/completions"

    def __init__(self, model: str | None = None, api_key: str | None = None):
        super().__init__(
            model=model or os.environ.get("MISTRAL_MODEL", "mistral-small-latest"),
            api_key=api_key or os.environ["MISTRAL_API_KEY"],
        )


class OpenRouterLiveControlLLM(_OpenAICompatibleLiveControlLLM):
    """Прод-клиент live-контура через OpenRouter (не бесплатный тир для тестов).
    Модель по умолчанию — google/gemini-2.5-flash, OVERRIDE через OPENROUTER_MODEL."""

    BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(self, model: str | None = None, api_key: str | None = None):
        super().__init__(
            model=model or os.environ.get("OPENROUTER_MODEL", "google/gemini-2.5-flash"),
            api_key=api_key or os.environ["OPENROUTER_API_KEY"],
        )


class AnthropicAPILiveControlLLM(LiveControlLLM):
    """Прямой вызов Anthropic Messages API (`/v1/messages`) вместо Claude Agent SDK CLI —
    убирает тот же харнесс-оверхед, что и `MistralLiveControlLLM`, но остаётся на модели
    Claude и получает structured output нативно через принудительный tool-use (`tool_choice`
    с единственным тулом `decide`, `input_schema` = JSON-схема `LiveControlDecision`) —
    надёжнее, чем просить JSON текстом в промпте (см. `MistralLiveControlLLM`): Anthropic
    сам гарантирует, что `tool_use.input` соответствует схеме, не нужно парсить/чинить текст.

    `base_url`/`api_key` берутся из `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY` — это может
    быть не сам api.anthropic.com, а Anthropic-совместимый прокси (см. `ANTHROPIC_BASE_URL`
    в `~/.claude/settings.json` Claude Code — тот же механизм). Как и Mistral-клиент, без
    сессии между ходами — `reset()` no-op."""

    DEFAULT_BASE_URL = "https://api.anthropic.com"
    ANTHROPIC_VERSION = "2023-06-01"
    TOOL_NAME = "decide"

    def __init__(self, model: str | None = None, api_key: str | None = None, base_url: str | None = None):
        self.model = model or os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")
        self.api_key = api_key or os.environ["ANTHROPIC_API_KEY"]
        self.base_url = (base_url or os.environ.get("ANTHROPIC_BASE_URL", self.DEFAULT_BASE_URL)).rstrip("/")
        self._client = httpx.AsyncClient(timeout=20.0)

    async def decide(self, system_prompt: str, turn_prompt: str) -> LiveControlDecision:
        response = await self._client.post(
            f"{self.base_url}/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": self.ANTHROPIC_VERSION,
            },
            json={
                "model": self.model,
                "max_tokens": 512,
                "system": system_prompt,
                "messages": [{"role": "user", "content": turn_prompt}],
                "tools": [
                    {
                        "name": self.TOOL_NAME,
                        "description": "Зафиксировать решение по текущему ходу интервью.",
                        "input_schema": LiveControlDecision.model_json_schema(),
                    }
                ],
                "tool_choice": {"type": "tool", "name": self.TOOL_NAME},
            },
        )
        response.raise_for_status()
        content = response.json()["content"]
        tool_use = next(block for block in content if block["type"] == "tool_use")
        return LiveControlDecision.model_validate(tool_use["input"])


class FakeLLM(LiveControlLLM):
    """Дублёр для локальных прогонов без подписки/сети — см. tests/ и scripts/simulate.py.

    Решение выбирается по простым ключевым словам в последней реплике кандидата
    (последняя строка turn_prompt, начинающаяся с "- "), чтобы сценарии в
    scripts/simulate.py были предсказуемы и читаемы.
    """

    async def decide(self, system_prompt: str, turn_prompt: str) -> LiveControlDecision:
        last_line = ""
        for line in turn_prompt.splitlines():
            if line.startswith("- "):
                last_line = line[2:].strip().lower()

        # CODING_SYSTEM_PROMPT (Phase.CODING, см. state_machine.py) содержит "coding_done" —
        # набор допустимых решений там другой (rule 6 CLAUDE.md: держать FakeLLM в синхроне).
        if "coding_done" in system_prompt:
            return self._decide_coding(last_line)

        if not last_line or last_line.endswith("...") or last_line.endswith(","):
            return LiveControlDecision(decision=Decision.CONTINUE, reasoning="fake: похоже на незаконченную мысль")

        if "не знаю" in last_line:
            return LiveControlDecision(
                decision=Decision.GAP,
                gap_type=GapType.LEADING_HINT,
                utterance="Ничего страшного, если сходу сложно вспомнить — подскажу один момент. Что скажете?",
                reasoning="fake: кандидат сказал 'не знаю'",
            )

        if len(last_line.split()) <= 4:
            return LiveControlDecision(
                decision=Decision.AMBIGUOUS,
                utterance="Всё по этому вопросу, или что-то добавите?",
                reasoning="fake: очень короткий ответ, неясно, закончил ли",
            )

        return LiveControlDecision(decision=Decision.EXHAUSTIVE, reasoning="fake: ответ выглядит полным")

    def _decide_coding(self, last_line: str) -> LiveControlDecision:
        """Ветка Phase.CODING (см. decide() выше) — та же идея: простые ключевые слова, не
        реальное понимание речи, чтобы сценарии оставались предсказуемыми."""
        if not last_line:
            # Нет реплики вовсе — это вызов по тишине (maybe_request_coding_hint) либо
            # обрывок мысли; для предсказуемости FakeLLM всегда предлагает подсказку на тишину.
            return LiveControlDecision(
                decision=Decision.GAP,
                gap_type=GapType.CODING_HINT,
                utterance="Попробуйте начать с самого простого случая и посмотреть, что не так.",
                reasoning="fake: кандидат молчит",
            )

        if any(word in last_line for word in ("готов", "закончил", "закончила", "можно дальше", "у меня всё")):
            return LiveControlDecision(decision=Decision.CODING_DONE, reasoning="fake: кандидат сказал, что готов")

        if any(word in last_line for word in ("не могу", "застрял", "застряла", "сложно", "не понимаю")):
            return LiveControlDecision(
                decision=Decision.GAP,
                gap_type=GapType.CODING_HINT,
                utterance="Попробуйте разбить задачу на более мелкие шаги — с чего бы вы начали?",
                reasoning="fake: кандидат сказал, что затрудняется",
            )

        return LiveControlDecision(decision=Decision.CONTINUE, reasoning="fake: кандидат просто думает вслух")
