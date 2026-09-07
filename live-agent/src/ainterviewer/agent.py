"""
LiveKit-обвязка над графом live-контура (state_machine.LiveContourEngine).

Вся логика "что сказать дальше/когда перейти к следующему вопросу" живёт в
`state_machine.py` и не знает про LiveKit вообще — этот файл только переводит события
фреймворка (VAD/STT определили конец хода кандидата) в вызовы `engine.*` и обратно
(текст от `engine.*` — в TTS). Это и есть ответ на вопрос "нужны ли агенту тулы для
диалога с кандидатом": НЕТ — весь диалоговый control flow уже реализован явным кодом
в `state_machine.py`, LiveKit тут просто транспорт (аудио <-> текст), а не второй
слой принятия решений.

Единственная точка кастомизации — `Agent.llm_node`: по умолчанию LiveKit сам вызывает
LLM с накопленной историей чата (`chat_ctx`) и генерирует ответ. Мы переопределяем этот
узел и НЕ используем накопленный `chat_ctx` для промпта вообще (кроме как источник
последней реплики кандидата) — весь релевантный контекст ведёт сам `LiveContourEngine`
(поле `QuestionRunState.dialogue`, раздел state_machine.py) и сбрасывает его при переходе
на следующий вопрос. Так буквально реализуется требование "контекст — только текущий
вопрос", а не "фреймворк сам решает, что помнить".

Запуск (см. README):
    .venv/Scripts/python.exe -m ainterviewer.agent console

ВНИМАНИЕ — не проверено вживую в этой сессии (нет Docker/подписки/аудио-устройств в
песочнице, где писался код): сам факт того, что `llm_node`, `AgentSession`, сигнатуры
`STT`/`TTS`/`VAD.load` соответствуют установленной версии livekit-agents==1.7.1,
проверено интроспекцией пакета (см. историю чата), но полный аудио-цикл (VAD -> STT ->
наш llm_node -> TTS) ни разу не прогонялся целиком. Первое, что нужно сделать при первом
реальном запуске — проверить, что `session.say()` для вступления и обычный поток через
`llm_node` не конфликтуют, и корректно доделать завершение job на Phase.DONE (см. TODO
ниже).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import Agent, AgentSession, JobContext, ModelSettings, WorkerOptions, cli
from livekit.agents import stt as lk_stt
from livekit.agents import tts as lk_tts
from livekit.agents.llm import ChatContext
from livekit.agents.types import NOT_GIVEN
from livekit.agents.utils import is_given
from livekit.agents.voice.room_io import RoomInputOptions
from livekit.agents.voice.turn import InterruptionOptions, TurnHandlingOptions
from livekit.plugins import openai as lk_openai
from livekit.plugins import silero

from .control_bridge import RedisEventSink
from .echo_filter import is_likely_echo
from .events import EventLog, EventSink, EventType
from .llm_client import (
    AnthropicAPILiveControlLLM,
    ClaudeAgentSDKLiveControlLLM,
    LiveControlLLM,
    MistralLiveControlLLM,
    OpenRouterLiveControlLLM,
)
from .prompts import INTRO_PHRASE
from .schema import InterviewInput, Question, Vacancy
from .state_machine import LiveContourEngine, Phase

load_dotenv()

logger = logging.getLogger("ainterviewer.agent")

# .../live-agent/src/ainterviewer/agent.py -> .../live-agent (не src/ — там нет ни
# mock_data/, ни out/; баг не выстреливал только потому, что этот путь ни разу не
# запускался вживую, см. README, «Статус проверки»).
AGENT_ROOT = Path(__file__).resolve().parent.parent.parent
MOCK_PATH = Path(os.environ.get("MOCK_INTERVIEW_PATH", AGENT_ROOT / "mock_data" / "interview_example.json"))


class InterviewerAgent(Agent):
    def __init__(self, engine: LiveContourEngine, stt: lk_openai.STT):
        # instructions не используется: llm_node переопределён целиком и не обращается
        # к self.llm/instructions — управление полностью у LiveContourEngine.
        #
        # llm= — реальный найденный баг (2026-09-05): без него self.llm остаётся None, и
        # фреймворк (agent_activity.py, _AgentActivity.on_end_of_turn) молча пропускает
        # ВСЮ генерацию ответа целиком строкой "elif self.llm is None: return  # skip
        # response if no llm is set" — ДО того, как вообще успевает дойти до вызова
        # llm_node. Наш llm_node полностью переопределён и не обращается к self.llm вообще
        # (см. ниже), так что сюда достаточно любого нефиктивного объекта — реального
        # HTTP-запроса к нему никогда не будет. STT_BASE_URL — просто уже гарантированно
        # резолвящийся внутри сети хост, эндпоинт /chat/completions там не нужен и не
        # вызывается.
        super().__init__(
            instructions="см. LiveContourEngine — весь промпт строится там",
            llm=lk_openai.LLM(
                base_url=os.environ["STT_BASE_URL"],
                api_key="not-needed",
                model="unused-llm-node-is-fully-overridden",
            ),
        )
        self.engine = engine
        # STT-подсказка меняется при переходе на новый вопрос (см. llm_node): термины
        # текущего вопроса + словарь навыков вакансии. Начальное значение (первый вопрос)
        # ставится в entrypoint при конструировании STT.
        self._stt = stt
        self._stt_question_index = 0
        # Раздел 2 задачи "live-interview quality pass" — эвристический фильтр эха
        # собственной TTS-речи, просочившегося обратно через микрофон кандидата
        # (см. echo_filter.is_likely_echo). Обновляется в трёх точках: сразу после
        # вступления (тут же, при конструировании) и в llm_node — после бэкчаннела и
        # после реальной реплики агента.
        self._last_agent_utterance = ""
        # Граф live-контура не потокобезопасен: обычный ход кандидата (llm_node) и
        # принудительный переход (таймер отведённого времени / кнопка «Дальше», см.
        # entrypoint) могут прийти одновременно — сериализуем их через один лок.
        self._engine_lock = asyncio.Lock()

    def _sync_stt_prompt(self) -> None:
        """Подсказка Whisper под текущий вопрос — вызывать после любого перехода на
        следующий вопрос (обычного или принудительного)."""
        if self.engine.state.question_index == self._stt_question_index:
            return
        self._stt_question_index = self.engine.state.question_index
        self._stt.update_options(
            prompt=_build_stt_prompt(self.engine.state.input.vacancy, self.engine.state.current_question)
        )
        logger.info("STT prompt updated for question index %d", self._stt_question_index)

    async def force_advance(self, session: AgentSession, reason: str) -> None:
        """Принудительный переход к следующему вопросу извне реактивного цикла — по кнопке
        «Дальше» кандидата или по истечении отведённого на вопрос времени."""
        async with self._engine_lock:
            reply = await self.engine.skip_current_question(reason=reason)
            self._sync_stt_prompt()
        if reply:
            self._last_agent_utterance = reply
            await session.say(reply, add_to_chat_ctx=False)

    async def maybe_nudge(self, session: AgentSession) -> None:
        """Половина отведённого времени истекла, кандидат молчит — одна мягкая подсказка."""
        async with self._engine_lock:
            phrase = self.engine.nudge()
        if phrase:
            self._last_agent_utterance = phrase
            await session.say(phrase, add_to_chat_ctx=False)

    async def receive_code_update(self, content: str) -> None:
        """Код кандидата изменился (format="live_coding") — из `code_update` в командном
        Redis-канале (см. `_command_loop`). Без TTS-ответа — просто синхронизация состояния
        графа, `LiveContourEngine.update_code` сам решает, нужна ли реакция (см. таймер)."""
        async with self._engine_lock:
            self.engine.update_code(content)

    async def request_coding_hint(self, session: AgentSession) -> None:
        """Кандидат долго не меняет код и не говорит во время решения задачи — движок сам
        проверит лимит подсказок (`CODING_HINT_LIMIT`) и промолчит, если он исчерпан."""
        async with self._engine_lock:
            phrase = await self.engine.maybe_request_coding_hint()
        if phrase:
            self._last_agent_utterance = phrase
            await session.say(phrase, add_to_chat_ctx=False)

    async def force_finish_coding(self, session: AgentSession, reason: str) -> None:
        """Истекло отведённое на решение задачи время — переход к фазе объяснения (не
        пропускаем вопрос целиком, см. `LiveContourEngine.force_finish_coding`)."""
        # Не трогает question_index (переход внутри одного и того же вопроса) — в отличие от
        # force_advance, _sync_stt_prompt() здесь не нужен.
        async with self._engine_lock:
            reply = await self.engine.force_finish_coding(reason)
        if reply:
            self._last_agent_utterance = reply
            await session.say(reply, add_to_chat_ctx=False)

    async def llm_node(self, chat_ctx: ChatContext, tools: list, model_settings: ModelSettings):  # noqa: ARG002
        # ChatContext.messages — метод (список нужно ЗВАТЬ, `chat_ctx.messages()`), не
        # свойство — реальный найденный баг (2026-09-05): `len(chat_ctx.messages)` падал
        # с TypeError, роняя llm_node сразу после первого реального вызова (фикс llm=
        # наконец довёл выполнение досюда). `.items` — правильное свойство, `list[ChatItem]`.
        logger.info("llm_node: called, items=%d", len(chat_ctx.items))
        user_messages = [m for m in chat_ctx.items if getattr(m, "role", None) == "user"]
        if not user_messages:
            logger.info("llm_node: no user messages, returning")
            return
        last_text = user_messages[-1].text_content or ""
        logger.info("llm_node: last_text=%r", last_text)

        if is_likely_echo(last_text, self._last_agent_utterance):
            logger.info("llm_node: last_text looks like agent echo, ignoring: %r", last_text)
            return

        # Слой 1 — мгновенный бэкчаннел без LLM (раздел 9.2, п.4 архитектурного документа).
        # Временно отключён (2026-09-06, явный запрос пользователя) — engine.backchannel_phrase()
        # оставлен как есть в state_machine.py, просто не вызываем/не озвучиваем здесь.

        # Слой 2 — собственно решение реактивного цикла (см. state_machine.py).
        logger.info("llm_node: calling engine.on_candidate_final_turn...")
        async with self._engine_lock:
            reply = await self.engine.on_candidate_final_turn(last_text)
            # Реплика движка могла увести нас на следующий вопрос (переход внутри
            # on_candidate_final_turn) — обновляем STT-подсказку под новый вопрос ДО того,
            # как кандидат начнёт на него отвечать. whisper-1 (не realtime) пересобирает
            # конфиг транскрипции на каждый запрос, так что update_options здесь достаточно.
            self._sync_stt_prompt()
        logger.info("llm_node: engine.on_candidate_final_turn returned %r", reply)

        if reply:
            self._last_agent_utterance = reply
            yield reply


# Whisper обрезает `prompt` до ~224 токенов; держим подсказку заведомо короче, иначе
# хвост (термины текущего вопроса) просто отбросится.
_STT_PROMPT_MAX_CHARS = 800


def _build_stt_prompt(vacancy: Vacancy, question: Question | None) -> str:
    """Раздел 5, гипотеза H4 архитектурного документа: словарь терминов как подсказка ASR.
    Whisper принимает это через `prompt` (не `keywords` — тот только у realtime
    gpt-transcribe, whisper-1 его не понимает).

    Две части: статичный словарь навыков вакансии на всё интервью + `stt_terms` текущего
    вопроса (заполнены backend'ом при approve). Термины вопроса идут первыми — если Whisper
    обрежет подсказку по лимиту, важное для текущего ответа переживёт обрезку. Это не
    подмешивание чужого вопроса в LLM, а подсказка ASR-словарю, поэтому принцип "контекст
    только текущий вопрос" не нарушается."""
    parts = [*(question.stt_terms if question else []),
             *vacancy.required_skills, *vacancy.nice_to_have_skills]
    seen: set[str] = set()
    ordered: list[str] = []
    for term in parts:
        key = term.strip().lower()
        if key and key not in seen:
            seen.add(key)
            ordered.append(term.strip())
    return ", ".join(ordered)[:_STT_PROMPT_MAX_CHARS]


class _OpenRouterSTT(lk_openai.STT):
    """`lk_openai.STT._recognize_impl` для модели с id ровно "whisper-1" жёстко ставит
    `response_format="verbose_json"` (см. `livekit/plugins/openai/stt.py`). OpenRouter этот
    формат для whisper не принимает — отвечает `400`, `retryable=False`, и `AgentSession`
    закрывается после первой же реплики кандидата (симптом снаружи — «агент замолчал»).
    Настройкой это не лечится: у STT-плагина нет параметра `response_format`. Здесь —
    тот же одиночный REST-вызов транскрипции, но с `response_format="json"`, который
    OpenRouter принимает. STT в этом деплое не realtime (whisper), поэтому единственный
    задействованный путь — `_recognize_impl`; realtime-ветку не трогаем."""

    async def _recognize_impl(self, buffer, *, language=NOT_GIVEN, conn_options):  # noqa: ANN001
        lang = (
            _as_languages_first(language)
            or (self._opts.languages[0] if self._opts.languages else None)
        )
        request: dict = {
            "file": ("file.wav", rtc.combine_audio_frames(buffer).to_wav_bytes(), "audio/wav"),
            "model": self._opts.model,
            "response_format": "json",
            "timeout": httpx.Timeout(30, connect=conn_options.timeout),
        }
        if lang:
            request["language"] = lang
        if is_given(self._opts.prompt) and self._opts.prompt:
            request["prompt"] = self._opts.prompt
        resp = await self._client.audio.transcriptions.create(**request)
        return lk_stt.SpeechEvent(
            type=lk_stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[lk_stt.SpeechData(text=resp.text, language=lang or "")],
        )


def _as_languages_first(language) -> str | None:  # noqa: ANN001
    """Первый язык из per-call `language` (str или list), либо None если не задан."""
    if not is_given(language):
        return None
    if isinstance(language, str):
        return language or None
    return language[0] if language else None


def _build_event_sinks(interview_id: str) -> list[EventSink]:
    """REDIS_URL — опциональна: без неё живой опрос кандидата работает как раньше
    (файловый EventLog, ни один существующий тест/скрипт не меняет поведение). С ней —
    те же события дополнительно уходят в Redis для control-канала backend/frontend
    (specs/004-candidate-interview-flow/research.md, п.2). Никогда не влияет на то, что
    решает граф — см. events.EventSink, `EventLog.emit()` глотает исключения sink'ов."""
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        return []
    from redis.asyncio import Redis

    redis = Redis.from_url(redis_url)
    return [RedisEventSink(redis, interview_id)]


def _room_name_is_interview_uuid(room_name: str | None) -> bool:
    """Раздел 3 задачи "live-interview quality pass": реальные интервью диспетчатся
    LiveKit в комнату, чьё имя — UUID интервью из Postgres (contracts/livekit-token.md).
    Локальные/ручные прогоны (console, scripts/simulate.py, mock_driver.py) либо не имеют
    комнаты вообще, либо используют произвольное имя вроде "demo-001" — это отличает
    "нужно тянуть реальные вопросы с backend" от "оставить мок как есть"."""
    if not room_name:
        return False
    try:
        uuid.UUID(room_name)
    except ValueError:
        return False
    return True


async def _load_interview_input(room_name: str | None) -> InterviewInput:
    """Грузит `InterviewInput` — с backend по реальному UUID интервью, либо (для
    локальных/ручных прогонов) из MOCK_PATH, как и раньше.

    Раздел 3 задачи "live-interview quality pass": сознательно БЕЗ тихого фолбэка на мок
    при сбое реального запроса — прогнать реальное интервью кандидата по вопросам чужой
    вакансии хуже, чем вообще не начать job (см. план, раздел 3), поэтому ошибка здесь
    логируется и пробрасывается дальше.
    """
    if _room_name_is_interview_uuid(room_name):
        assert room_name is not None
        url = f"{os.environ.get('BACKEND_BASE_URL', 'http://backend:8000')}/api/v1/interviews/{room_name}/live-input"
        headers = {"X-Live-Agent-Token": os.environ["LIVE_AGENT_TOKEN"]}
        logger.info("_load_interview_input: fetching real interview input from %s", url)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
        except httpx.HTTPError:
            logger.exception("_load_interview_input: failed to fetch interview input from %s", url)
            raise
        interview = InterviewInput.model_validate_json(response.text)
        logger.info("_load_interview_input: loaded real interview %s from backend", interview.interview_id)
        return interview

    interview = InterviewInput.model_validate_json(MOCK_PATH.read_text(encoding="utf-8"))
    # КРИТИЧНО для specs/004-candidate-interview-flow: backend подписывается на Redis-канал
    # `live-agent:events:{Interview.id из Postgres}` — тот же id, что выпущен в
    # LiveKit-токене как `room_name` (contracts/livekit-token.md). Даже когда вопросы
    # берутся из мока (нет реального UUID-имени комнаты), id интервью должен браться из
    # комнаты, в которую продиспатчило LiveKit, а не из мок-файла — иначе backend слушает
    # канал с реальным UUID, а live-agent публикует в канал "demo-001" (id из мок-файла),
    # и они никогда не встречаются: control-канал молча не получает ни одного события.
    if room_name:
        interview.interview_id = room_name
    return interview


def commands_channel_name(interview_id: str) -> str:
    """Канал команд кандидат→live-agent (кнопка «Дальше» на карточке кандидата). Backend
    публикует сюда, получив сообщение по control-WS; ответная сторона control_bridge
    (события live-agent→UI) — отдельный канал `live-agent:events:{id}`."""
    return f"live-agent:commands:{interview_id}"


# Порог "тишины" (ни новых символов кода, ни реплик) во время Phase.CODING, после которого
# агент сам инициирует запрос на подсказку у LLM (см. _question_timer_loop ниже) — не таймаут
# на весь вопрос (тот — estimated_duration_sec), а интервал между попытками подсказать.
_CODING_HINT_SILENCE_SEC = 45.0


async def _question_timer_loop(session: AgentSession, agent: InterviewerAgent) -> None:
    """Таймер отведённого на вопрос времени для обычных (assessment) вопросов. Пока кандидат
    не сказал ни слова: на половине лимита — одна подсказка (agent.maybe_nudge), по
    истечении — принудительный переход к следующему вопросу. Как только кандидат начал
    отвечать, дальнейший ход вопроса ведёт обычный реактивный цикл (llm_node).

    Для format="live_coding" (Phase.CODING) — отдельная ветка: вместо nudge/force_advance
    периодически (каждые _CODING_HINT_SILENCE_SEC без изменений в коде/реплик) просит у
    движка подсказку (agent.request_coding_hint — сам проверит лимит CODING_HINT_LIMIT), а по
    истечении общего времени на вопрос — не пропускает вопрос, а переводит к объяснению
    (agent.force_finish_coding). Дальнейшая фаза объяснения этим таймером уже не ведётся."""
    engine = agent.engine
    tracked_index = -1
    started_at = 0.0
    nudged = advanced = False
    last_activity_len = -1
    last_hint_at = 0.0
    while engine.state.phase != Phase.DONE:
        await asyncio.sleep(2.0)
        st = engine.state
        if st.current is None or not engine.silence_timer_enabled():
            tracked_index = st.question_index
            continue
        if st.question_index != tracked_index:
            tracked_index = st.question_index
            started_at = time.monotonic()
            nudged = advanced = False
            last_activity_len = -1
            last_hint_at = started_at
            continue

        elapsed = time.monotonic() - started_at
        limit = engine.time_limit_sec()

        if st.current.question.format == "live_coding":
            if st.phase != Phase.CODING:
                # Уже в фазе объяснения решения — таймер задачи здесь больше не ведёт.
                continue
            activity_len = len(st.current.code) + len(st.current.dialogue)
            if activity_len != last_activity_len:
                last_activity_len = activity_len
                last_hint_at = time.monotonic()
            elif time.monotonic() - last_hint_at >= _CODING_HINT_SILENCE_SEC:
                last_hint_at = time.monotonic()
                await agent.request_coding_hint(session)
            if not advanced and elapsed >= limit:
                advanced = True
                await agent.force_finish_coding(session, reason="time_limit")
            continue

        if st.current.dialogue:
            continue
        if not nudged and elapsed >= limit / 2:
            nudged = True
            await agent.maybe_nudge(session)
        elif not advanced and elapsed >= limit:
            advanced = True
            await agent.force_advance(session, reason="time_limit")


async def _command_loop(session: AgentSession, agent: InterviewerAgent, redis, interview_id: str) -> None:
    pubsub = redis.pubsub()
    await pubsub.subscribe(commands_channel_name(interview_id))
    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                cmd = json.loads(message["data"])
            except (TypeError, json.JSONDecodeError):
                continue
            if cmd.get("type") == "skip":
                logger.info("_command_loop: candidate requested next question")
                await agent.force_advance(session, reason="candidate_skip")
            elif cmd.get("type") == "code_update":
                # format="live_coding" — backend пересылает сюда содержимое редактора
                # кандидата на каждое candidate_input (см. interview_ws.py). Переход к
                # объяснению решения — голосом (обычный llm_node), не отдельной командой.
                await agent.receive_code_update(cmd.get("content", ""))
    finally:
        await pubsub.unsubscribe(commands_channel_name(interview_id))
        await pubsub.aclose()


async def entrypoint(ctx: JobContext) -> None:
    room_name = ctx.job.room.name
    interview = await _load_interview_input(room_name)

    events = EventLog(
        AGENT_ROOT / "out" / f"{interview.interview_id}.jsonl",
        sinks=_build_event_sinks(interview.interview_id),
    )
    llm: LiveControlLLM
    llm_provider = os.environ.get("LLM_PROVIDER", "claude_sdk")
    if llm_provider == "mistral":
        # Прямой REST к Mistral вместо Claude Agent SDK CLI — обходит харнесс-накладные
        # расходы, см. llm_client.py. Опционально, включается явно (LLM_PROVIDER=mistral).
        llm = MistralLiveControlLLM()
    elif llm_provider == "anthropic_api":
        # Прямой Anthropic Messages API (сам api.anthropic.com или совместимый прокси,
        # см. ANTHROPIC_BASE_URL) вместо Claude Agent SDK CLI. Локальная опция, не прод.
        llm = AnthropicAPILiveControlLLM()
    elif llm_provider == "openrouter":
        # Прод-деплой: OpenRouter, модель OPENROUTER_MODEL / google/gemini-2.5-flash.
        # Не бесплатный тир — см. llm_client.py.
        llm = OpenRouterLiveControlLLM()
    else:
        llm = ClaudeAgentSDKLiveControlLLM()
    engine = LiveContourEngine(interview, llm, events)

    stt = _OpenRouterSTT(
        base_url=os.environ["STT_BASE_URL"],  # напр. https://openrouter.ai/api/v1
        api_key=os.environ.get("STT_API_KEY", "not-needed"),
        model=os.environ.get("STT_MODEL", "whisper-1"),
        # Реальный найденный баг: у плагина language по умолчанию "en" — без явного
        # переопределения faster-whisper-server честно транскрибировал русскую речь
        # как английскую (не ошибка сервера, а то, что мы сами ему сказали).
        language=os.environ.get("STT_LANGUAGE", "ru"),
        # H4: словарь терминов как подсказка ASR. Начальное значение — под первый вопрос;
        # дальше InterviewerAgent.llm_node подменяет `prompt` при каждом переходе на
        # следующий вопрос (stt.update_options).
        prompt=_build_stt_prompt(interview.vacancy, interview.questions[0] if interview.questions else None),
    )

    tts_api_key = os.environ.get("TTS_API_KEY") or os.environ.get("OPENROUTER_API_KEY")
    if not tts_api_key:
        raise RuntimeError("TTS_API_KEY or OPENROUTER_API_KEY must be set (non-empty)")
    # voice обязателен у livekit-plugins-openai (дефолт конструктора — "ash").
    # Qwen TTS на OpenRouter: документированный голос loongjohn; alloy скорее всего
    # даст 400 (как ash давал 400 на fish-audio/s1). Явно шлём loongjohn, иначе плагин
    # подставит ash и TTS молча умрёт.
    tts_kwargs: dict[str, str] = {
        "base_url": os.environ["TTS_BASE_URL"],
        "api_key": tts_api_key,
        "model": os.environ.get("TTS_MODEL", "qwen/qwen-audio-3.0-tts-flash"),
        "voice": os.environ.get("TTS_VOICE") or "loongjohn",
    }

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=stt,
        # StreamAdapter оставляем на случай capabilities.streaming=True у openai-плагина
        # (у 1.8 сейчас streaming=False, но framework может звать tts.stream()).
        tts=lk_tts.StreamAdapter(
            tts=lk_openai.TTS(**tts_kwargs),
        ),
        # Пауза детектится по VAD (Silero), не через LLM — раздел 3 архитектурного
        # документа: "живая пауза" не должна ждать ещё один сетевой запрос сверху.
        # turn_handling (не плоский turn_detection=) — раздел 1 задачи "live-interview
        # quality pass" (2026-09-05): подтверждено интроспекцией пакета
        # (livekit/agents/voice/turn.py), что плоские kwargs типа min_interruption_duration
        # — deprecated-алиасы, транслируемые в TurnHandlingOptions (agent_session.py,
        # _migrate_turn_handling). min_duration 0.5s -> 1.0s: полсекунды любого
        # VAD-звука (шум помещения, эхо собственной речи агента, кашель) засчитывалось
        # как прерывание. resume_false_interruption/false_interruption_timeout оставлены
        # на дефолтах (True/2.0) — уже компенсируют ложные срабатывания.
        turn_handling=TurnHandlingOptions(
            turn_detection="vad",
            interruption=InterruptionOptions(min_duration=1.0),
        ),
    )

    agent = InterviewerAgent(engine, stt)

    # Логи на каждом шаге — временно, для диагностики зависания без единой ошибки при
    # первом живом прогоне (2026-09-04): процесс тихо замирал где-то между регистрацией
    # воркера и первой репликой, ни одна из строк ниже не появлялась в логах контейнера.
    logger.info("entrypoint: ctx.connect()...")
    await ctx.connect()
    logger.info("entrypoint: ctx.connect() done, session.start()...")

    # Временные хуки — диагностика (2026-09-05): после фикса room=ctx.room агент реально
    # публикует TTS-аудио (подтверждено логами livekit-server), но ни разу не дошло до
    # STT (ни одного запроса в логах STT-сервера) — неясно, доходит ли звук кандидата до
    # VAD вообще. audio_enabled=True — явно, не полагаясь на разрешение NOT_GIVEN по
    # умолчанию, на случай если оно резолвится не так, как ожидается.
    @session.on("user_input_transcribed")
    def _on_user_transcript(ev):  # noqa: ANN001
        logger.info("user_input_transcribed: transcript=%r is_final=%s", ev.transcript, ev.is_final)
        # Живые субтитры речи кандидата: и промежуточный (interim), и финальный транскрипт
        # STT — по мере поступления, ещё до реактивного цикла. Это черновой ASR (тот же
        # статус, что у CANDIDATE_UTTERANCE), только потоковый; batch-контур его не читает,
        # получатель — субтитры кандидатского UI (control_channel: stt_partial →
        # subtitle_candidate).
        text = (ev.transcript or "").strip()
        if not text:
            return
        events.emit(
            EventType.STT_PARTIAL,
            question_id=engine.state.current.question.id if engine.state.current else None,
            payload={"text": text, "is_final": ev.is_final},
        )

    @session.on("user_state_changed")
    def _on_user_state(ev):  # noqa: ANN001
        logger.info("user_state_changed: %r", ev)

    # room=ctx.room — реальный найденный баг (2026-09-05): без него AgentSession.start()
    # не создаёт RoomIO вообще ("Create a default RoomIO if the input or output audio is
    # not already set", см. докстринг) — TTS вызывался и реально синтезировал (подтверждено
    # логами tts), но публиковать аудио было некуда, и STT кандидата тоже не читался.
    # Молча, без единой ошибки — session.say() просто возвращает SpeechHandle сразу же.
    await session.start(
        agent=agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(audio_enabled=True),
    )
    logger.info("entrypoint: session.start() done, engine.start()...")

    first_utterance = f"{INTRO_PHRASE} {await engine.start()}"
    agent._last_agent_utterance = first_utterance
    logger.info("entrypoint: engine.start() done, session.say()...")
    # add_to_chat_ctx=False: это вступление не должно попасть в chat_ctx как "assistant"-реплика,
    # потому что мы им всё равно не пользуемся в llm_node (см. класс выше) — она там просто лишняя.
    await session.say(first_utterance, add_to_chat_ctx=False)
    logger.info("entrypoint: session.say() done")

    # Таймер отведённого времени и канал команд («Дальше») — только для реальных интервью
    # (комната = UUID из Postgres). Локальные/ручные прогоны (console, simulate.py) их не
    # запускают: там нет ни осмысленного лимита времени, ни backend'а, публикующего команды.
    background: list[asyncio.Task] = []
    command_redis = None
    if _room_name_is_interview_uuid(room_name):
        background.append(asyncio.create_task(_question_timer_loop(session, agent)))
        redis_url = os.environ.get("REDIS_URL")
        if redis_url:
            from redis.asyncio import Redis

            command_redis = Redis.from_url(redis_url)
            background.append(
                asyncio.create_task(_command_loop(session, agent, command_redis, interview.interview_id))
            )

    try:
        while engine.state.phase != Phase.DONE:
            await asyncio.sleep(1.0)
    finally:
        for task in background:
            task.cancel()
        for task in background:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if command_redis is not None:
            await command_redis.aclose()

    # Phase.DONE выставляется СИНХРОННО внутри on_candidate_final_turn — до того, как
    # llm_node успел отдать прощальную фразу в TTS. Реальный найденный баг (2026-09-06):
    # ctx.shutdown() срабатывал в пределах секунды и убивал процесс, не дав агенту
    # договорить «последний вопрос, ответы обрабатываются» — кандидат видел, как звонок
    # оборвался на полуслове. Ждём, пока текущая реплика допроиграется: короткая пауза,
    # чтобы llm_node успел поставить фразу в очередь, затем drain() — он ждёт конца всей
    # активной генерации/озвучки, — затем ещё пауза на долив последних аудио-фреймов и
    # на асинхронную публикацию INTERVIEW_COMPLETED в Redis (RedisEventSink.publish
    # планирует её как задачу на этом же loop).
    await asyncio.sleep(2.0)
    with contextlib.suppress(Exception):
        await session.drain()
    await asyncio.sleep(2.0)
    logger.info("entrypoint: interview complete — shutting down job")
    ctx.shutdown()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
