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


class MistralLiveControlLLM(LiveControlLLM):
    """Прямой REST-вызов Mistral Chat Completions вместо Claude Agent SDK CLI — убирает
    накладные расходы харнесса (см. докстринг модуля): один `httpx`-запрос без
    подпроцесса. `response_format: json_object` у Mistral не принимает JSON-схему (в
    отличие от `output_format` Claude Agent SDK) — схема ответа добавляется текстом в
    system prompt, а `LiveControlDecision.model_validate()` сам проверяет результат.

    Без сессии/подпроцесса между ходами — `reset()` не держит состояния, каждый вызов
    независим (обычный stateless HTTP-клиент)."""

    BASE_URL = "https://api.mistral.ai/v1/chat/completions"

    _SCHEMA_HINT = """\

Ответь СТРОГО одним JSON-объектом, без markdown-обёртки (```), без текста до или после \
JSON, ровно с такими полями:
{
  "decision": "continue" | "exhaustive" | "ambiguous" | "gap",
  "gap_type": "clarification" | "leading_hint" | "drill_down" | null,
  "utterance": "текст реплики кандидату, или null при decision=continue/exhaustive",
  "reasoning": "короткое обоснование для протокола"
}
gap_type обязателен (не null), только если decision="gap"."""

    def __init__(self, model: str | None = None, api_key: str | None = None):
        self.model = model or os.environ.get("MISTRAL_MODEL", "mistral-small-latest")
        self.api_key = api_key or os.environ["MISTRAL_API_KEY"]
        self._client = httpx.AsyncClient(timeout=20.0)

    async def decide(self, system_prompt: str, turn_prompt: str) -> LiveControlDecision:
        response = await self._client.post(
            self.BASE_URL,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt + self._SCHEMA_HINT},
                    {"role": "user", "content": turn_prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
            },
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        return LiveControlDecision.model_validate(json.loads(raw))


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
