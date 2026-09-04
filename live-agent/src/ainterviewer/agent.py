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

import os
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, ModelSettings, WorkerOptions, cli
from livekit.agents.llm import ChatContext
from livekit.plugins import openai as lk_openai
from livekit.plugins import silero

from .control_bridge import RedisEventSink
from .events import EventLog, EventSink
from .llm_client import ClaudeAgentSDKLiveControlLLM
from .prompts import INTRO_PHRASE
from .schema import InterviewInput
from .state_machine import LiveContourEngine

load_dotenv()

AGENT_ROOT = Path(__file__).resolve().parent.parent
MOCK_PATH = Path(os.environ.get("MOCK_INTERVIEW_PATH", AGENT_ROOT / "mock_data" / "interview_example.json"))


class InterviewerAgent(Agent):
    def __init__(self, engine: LiveContourEngine):
        # instructions не используется: llm_node переопределён целиком и не обращается
        # к self.llm/instructions — управление полностью у LiveContourEngine.
        super().__init__(instructions="см. LiveContourEngine — весь промпт строится там")
        self.engine = engine

    async def llm_node(self, chat_ctx: ChatContext, tools: list, model_settings: ModelSettings):  # noqa: ARG002
        user_messages = [m for m in chat_ctx.messages if m.role == "user"]
        if not user_messages:
            return
        last_text = user_messages[-1].text_content or ""

        # Слой 1 — мгновенный бэкчаннел без LLM (раздел 9.2, п.4 архитектурного документа).
        yield self.engine.backchannel_phrase()

        # Слой 2 — собственно решение реактивного цикла (см. state_machine.py).
        reply = await self.engine.on_candidate_final_turn(last_text)
        if reply:
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


async def entrypoint(ctx: JobContext) -> None:
    interview = InterviewInput.model_validate_json(MOCK_PATH.read_text(encoding="utf-8"))

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
            voice=os.environ.get("TTS_VOICE", "irina"),
            # Плагин по умолчанию шлёт model="gpt-4o-mini-tts" — реальный найденный баг,
            # с ним падают все self-hosted TTS-сервисы (не облачные имена моделей). Для
            # speaches.ai `model` — это полный HF repo id голоса
            # (speaches-ai/piper-ru_RU-<имя>-medium), не просто псевдоним вроде "tts-1".
            model=os.environ.get("TTS_MODEL", "speaches-ai/piper-ru_RU-irina-medium"),
        ),
        # Пауза детектится по VAD (Silero), не через LLM — раздел 3 архитектурного
        # документа: "живая пауза" не должна ждать ещё один сетевой запрос сверху.
        turn_detection="vad",
    )

    agent = InterviewerAgent(engine)
    await ctx.connect()
    await session.start(agent=agent)

    first_utterance = f"{INTRO_PHRASE} {await engine.start()}"
    # add_to_chat_ctx=False: это вступление не должно попасть в chat_ctx как "assistant"-реплика,
    # потому что мы им всё равно не пользуемся в llm_node (см. класс выше) — она там просто лишняя.
    await session.say(first_utterance, add_to_chat_ctx=False)

    # TODO: не реализовано и не проверено — дождаться engine.state.phase == Phase.DONE
    # (например, подпиской на событие INTERVIEW_COMPLETED в EventLog или опросом состояния)
    # и корректно завершить job (ctx.shutdown() / отключить комнату). Без этого процесс
    # зависает после последнего вопроса — первое, что нужно доделать перед демо.


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
