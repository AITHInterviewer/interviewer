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

import logging
import os
import uuid
from pathlib import Path

import httpx
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, ModelSettings, WorkerOptions, cli
from livekit.agents.llm import ChatContext
from livekit.agents.voice.room_io import RoomInputOptions
from livekit.agents.voice.turn import InterruptionOptions, TurnHandlingOptions
from livekit.plugins import openai as lk_openai
from livekit.plugins import silero

from .control_bridge import RedisEventSink
from .echo_filter import is_likely_echo
from .events import EventLog, EventSink
from .llm_client import ClaudeAgentSDKLiveControlLLM
from .prompts import INTRO_PHRASE
from .schema import InterviewInput
from .state_machine import LiveContourEngine

load_dotenv()

logger = logging.getLogger("ainterviewer.agent")

# .../live-agent/src/ainterviewer/agent.py -> .../live-agent (не src/ — там нет ни
# mock_data/, ни out/; баг не выстреливал только потому, что этот путь ни разу не
# запускался вживую, см. README, «Статус проверки»).
AGENT_ROOT = Path(__file__).resolve().parent.parent.parent
MOCK_PATH = Path(os.environ.get("MOCK_INTERVIEW_PATH", AGENT_ROOT / "mock_data" / "interview_example.json"))


class InterviewerAgent(Agent):
    def __init__(self, engine: LiveContourEngine):
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
        # Раздел 2 задачи "live-interview quality pass" — эвристический фильтр эха
        # собственной TTS-речи, просочившегося обратно через микрофон кандидата
        # (см. echo_filter.is_likely_echo). Обновляется в трёх точках: сразу после
        # вступления (тут же, при конструировании) и в llm_node — после бэкчаннела и
        # после реальной реплики агента.
        self._last_agent_utterance = ""

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
        backchannel = self.engine.backchannel_phrase()
        self._last_agent_utterance = backchannel
        yield backchannel

        # Слой 2 — собственно решение реактивного цикла (см. state_machine.py).
        logger.info("llm_node: calling engine.on_candidate_final_turn...")
        reply = await self.engine.on_candidate_final_turn(last_text)
        logger.info("llm_node: engine.on_candidate_final_turn returned %r", reply)
        if reply:
            self._last_agent_utterance = reply
            yield reply


def _build_stt_vocabulary_prompt(interview: InterviewInput) -> str:
    """Раздел 5, гипотеза H4 архитектурного документа: словарь терминов вакансии как
    подсказка ASR. Whisper поддерживает это через параметр `prompt` (не через `keywords`
    — тот работает только с realtime gpt-transcribe-моделями, whisper-1 его не понимает).
    Термины вакансии — не "другой вопрос", а маленькая статическая подсказка на всё
    интервью, поэтому не нарушает принцип "контекст только текущий вопрос" (раздел
    prompts.py) — это не подмешивание чужого вопроса в LLM, а подсказка ASR-словарю."""
    terms = [*interview.vacancy.required_skills, *interview.vacancy.nice_to_have_skills]
    return ", ".join(terms)


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


async def entrypoint(ctx: JobContext) -> None:
    room_name = ctx.job.room.name
    interview = await _load_interview_input(room_name)

    events = EventLog(
        AGENT_ROOT / "out" / f"{interview.interview_id}.jsonl",
        sinks=_build_event_sinks(interview.interview_id),
    )
    llm = ClaudeAgentSDKLiveControlLLM()
    engine = LiveContourEngine(interview, llm, events)

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=lk_openai.STT(
            base_url=os.environ["STT_BASE_URL"],  # напр. http://localhost:8001/v1 (см. docker-compose.yml)
            api_key=os.environ.get("STT_API_KEY", "not-needed"),
            model=os.environ.get("STT_MODEL", "whisper-1"),
            # Реальный найденный баг: у плагина language по умолчанию "en" — без явного
            # переопределения faster-whisper-server честно транскрибировал русскую речь
            # как английскую (не ошибка сервера, а то, что мы сами ему сказали).
            language=os.environ.get("STT_LANGUAGE", "ru"),
            # H4: словарь терминов вакансии — реальная жалоба на качество распознавания
            # техтерминов, не гипотетическая.
            prompt=_build_stt_vocabulary_prompt(interview),
        ),
        tts=lk_openai.TTS(
            base_url=os.environ["TTS_BASE_URL"],  # напр. http://localhost:8002/v1
            api_key=os.environ.get("TTS_API_KEY", "not-needed"),
            voice=os.environ.get("TTS_VOICE", "ruslan"),
            # Плагин по умолчанию шлёт model="gpt-4o-mini-tts" — реальный найденный баг,
            # с ним падают все self-hosted TTS-сервисы (не облачные имена моделей). Для
            # speaches.ai `model` — это полный HF repo id голоса
            # (speaches-ai/piper-ru_RU-<имя>-medium), не просто псевдоним вроде "tts-1".
            model=os.environ.get("TTS_MODEL", "speaches-ai/piper-ru_RU-ruslan-medium"),
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

    agent = InterviewerAgent(engine)

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
        logger.info("user_input_transcribed: %r", ev)

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

    # TODO: не реализовано и не проверено — дождаться engine.state.phase == Phase.DONE
    # (например, подпиской на событие INTERVIEW_COMPLETED в EventLog или опросом состояния)
    # и корректно завершить job (ctx.shutdown() / отключить комнату). Без этого процесс
    # зависает после последнего вопроса — первое, что нужно доделать перед демо.


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
