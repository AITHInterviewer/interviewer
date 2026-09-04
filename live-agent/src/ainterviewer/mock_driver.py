"""
HTTP-драйвер live-контура для ручной сквозной проверки (mock-флоу
specs/004-candidate-interview-flow).

Зачем: дать возможность вживую пройти интервью в браузере — услышать вопрос, ответить
голосом, получить уточняющий/адаптивный вопрос, переход дальше и завершение — ДО того,
как готовы Foundational-задачи 004 (WS control-канал и LiveKit-медиа заблокированы на
DB-слое, который принадлежит [[003-recruiter-vacancy-management]]).

Что здесь настоящее, а что нет:
  НАСТОЯЩЕЕ — решения. Диалоговый control flow принимает тот же `LiveContourEngine`
  (`state_machine.py`), с теми же бюджетами чек-инов/подсказок/адаптивных вопросов и тем
  же протоколом событий (`out/<id>.jsonl`). Никакой второй копии логики переходов здесь
  нет — это прямое требование FR-008/FR-011 спеки, и оно соблюдается даже в mock-режиме.
  НЕ НАСТОЯЩЕЕ — транспорт. Вместо LiveKit-комнаты и WS control-канала здесь простой
  HTTP: браузер сам шлёт распознанный текст реплики и сам проигрывает ответ. Границу
  хода кандидата определяет клиентский детектор тишины, а не Silero VAD.

Это отдельный драйвер рядом с `agent.py` (LiveKit), а не замена ему — так же, как
`scripts/simulate.py` является третьим драйвером того же графа.

Запуск (см. README):
    .venv/Scripts/python.exe -m ainterviewer.mock_driver     # порт 3909

Написан на голом Starlette (не FastAPI) сознательно: Starlette и uvicorn уже есть в
зависимостях `livekit-agents`, а FastAPI пришлось бы доустанавливать — на этой машине
PyPI сейчас недоступен, и лишняя зависимость ради трёх эндпоинтов того не стоит.
"""

from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .control_bridge import RedisEventSink
from .events import EventLog, EventSink
from .llm_client import ClaudeAgentSDKLiveControlLLM, FakeLLM, LiveControlLLM
from .prompts import INTRO_PHRASE
from .schema import InterviewInput
from .state_machine import LiveContourEngine, Phase

# .../live-agent/src/ainterviewer/mock_driver.py -> .../live-agent
AGENT_ROOT = Path(__file__).resolve().parent.parent.parent
MOCK_PATH = Path(os.environ.get("MOCK_INTERVIEW_PATH", AGENT_ROOT / "mock_data" / "interview_example.json"))

# session_id -> engine. In-memory: драйвер для ручной проверки, переживать рестарт не должен.
_SESSIONS: dict[str, LiveContourEngine] = {}


def _build_llm() -> LiveControlLLM:
    """`LIVE_AGENT_FAKE_LLM=1` — прогон без подписки/сети (детерминированный FakeLLM,
    тот же, что в тестах и simulate.py). По умолчанию — настоящий Claude Agent SDK,
    которому нужен авторизованный `claude` CLI в том же окружении (`claude login`)."""
    if os.environ.get("LIVE_AGENT_FAKE_LLM") == "1":
        return FakeLLM()
    return ClaudeAgentSDKLiveControlLLM()


def _build_sinks(interview_id: str) -> list[EventSink]:
    redis_url = os.environ.get("REDIS_URL")
    if not redis_url:
        return []
    from redis.asyncio import Redis

    return [RedisEventSink(Redis.from_url(redis_url), interview_id)]


def _engine_state(engine: LiveContourEngine) -> dict:
    state = engine.state
    current = state.current
    return {
        "phase": state.phase.name.lower(),
        "done": state.phase is Phase.DONE,
        "question_id": current.question.id if current else None,
        "question_text": current.question.text if current else None,
        "question_index": state.question_index,
        "questions_total": len(state.input.questions),
        "adaptive_budget_remaining": state.adaptive_budget_remaining,
    }


async def start_session(request: Request) -> JSONResponse:
    session_id = request.path_params["session_id"]
    interview = InterviewInput.model_validate_json(MOCK_PATH.read_text(encoding="utf-8"))

    events = EventLog(
        AGENT_ROOT / "out" / f"{session_id}.jsonl",
        sinks=_build_sinks(session_id),
    )
    engine = LiveContourEngine(interview, _build_llm(), events)
    _SESSIONS[session_id] = engine

    first_question = await engine.start()
    return JSONResponse(
        {
            "text": f"{INTRO_PHRASE} {first_question}",
            "vacancy_title": interview.vacancy.title,
            **_engine_state(engine),
        }
    )


async def submit_turn(request: Request) -> JSONResponse:
    session_id = request.path_params["session_id"]
    engine = _SESSIONS.get(session_id)
    if engine is None:
        return JSONResponse({"detail": "session not started"}, status_code=404)
    if engine.state.phase is Phase.DONE:
        return JSONResponse({"detail": "interview already completed"}, status_code=409)

    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        # Пустой распознанный текст — не реплика; граф не должен получать пустой ход.
        return JSONResponse({"text": None, "ignored_empty": True, **_engine_state(engine)})

    reply = await engine.on_candidate_final_turn(text)
    # reply is None — решение CONTINUE: агент молчит, кандидат продолжает говорить.
    return JSONResponse({"text": reply, "ignored_empty": False, **_engine_state(engine)})


async def health(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "active_sessions": len(_SESSIONS)})


app = Starlette(
    routes=[
        Route("/health", health),
        Route("/session/{session_id}/start", start_session, methods=["POST"]),
        Route("/session/{session_id}/turn", submit_turn, methods=["POST"]),
    ],
    middleware=[
        # Драйвер вызывается backend'ом (server-to-server), но CORS открыт, чтобы можно
        # было дёргать эндпоинты руками из браузера/curl при отладке. Это dev-инструмент.
        Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]),
    ],
)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("MOCK_DRIVER_PORT", "3909")))
