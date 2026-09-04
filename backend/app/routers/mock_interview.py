"""
MOCK-контур для ручной проверки голосового цикла (STT → вопрос → TTS) без LiveKit,
без `live-agent` и без control-канала.

ЭТО НЕ РЕАЛИЗАЦИЯ АРХИТЕКТУРЫ ИЗ specs/004-candidate-interview-flow. Там переходы между
вопросами инициирует граф `LiveContourEngine` в `live-agent`, а backend только
ретранслирует его решения (FR-011), медиа идёт через LiveKit room (FR-012), а UI-состояние
приходит по WebSocket control-каналу (FR-009). Здесь всё это намеренно срезано: вопросы
листает сам фронтенд по кнопке, аудио ходит обычным HTTP через этот прокси.

Зачем нужен: дать возможность вживую послушать/проговорить полный круг с реальными
self-hosted STT/TTS до того, как готовы Foundational-задачи 004 (заблокированы на
DB-слое, который принадлежит [[003-recruiter-vacancy-management]]). Ровно тот же STT/TTS,
что использует live-контур (live-agent/docker-compose.yml), поэтому проверка качества
распознавания/синтеза здесь переносима на боевой контур, а проверка диалоговой логики —
НЕТ.

Удалить целиком, когда заработает настоящий control-канал (tasks.md, Phase 2/4/5).

Прокси нужен, потому что STT/TTS-контейнеры не выставлены в браузер: у них нет CORS и в
проде они не должны быть публично доступны. Реализован на stdlib (`urllib`), а не на
`httpx`, сознательно: `httpx` лежит в dev-extra, его нет в `runner`-образе
(Dockerfile, `uv sync --no-dev`), а перегенерировать `uv.lock` сейчас нельзя — PyPI
недоступен с этой машины.
"""

from __future__ import annotations

import json
import mimetypes
import urllib.error
import urllib.request
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.config import settings

router = APIRouter(prefix="/mock-interview", tags=["mock-interview"])

# Подмножество live-agent/mock_data/interview_example.json — те же формулировки, чтобы
# ручная проверка распознавания шла на реальных техтерминах вакансии, а не на "раз-два-три".
MOCK_QUESTIONS: list[dict[str, Any]] = [
    {
        "id": "q1",
        "text": (
            "Расскажите, почему вы сейчас находитесь в поиске работы и что для себя ищете? "
            "Каким проектом и какими задачами хотелось бы заниматься?"
        ),
        "role": "warmup",
    },
    {
        "id": "q2",
        "text": (
            "Расскажите про свой продакшн-сервис на Python с очередью — Kafka или RabbitMQ. "
            "Какие библиотеки, как добивались, чтобы сообщение не потерялось и не обработалось дважды?"
        ),
        "role": "assessment",
    },
    {
        "id": "q3",
        "text": (
            "Как вы загружали большие объёмы данных в PostgreSQL? Назовите объёмы, "
            "как была устроена загрузка и как находили причину медленных запросов?"
        ),
        "role": "assessment",
    },
    {
        "id": "q4",
        "text": "Спасибо! Есть ли у вас вопросы ко мне?",
        "role": "closing",
    },
]

_HTTP_TIMEOUT_SECONDS = 120


class SpeakRequest(BaseModel):
    text: str


class TurnRequest(BaseModel):
    text: str


@router.get("/questions")
async def list_mock_questions() -> dict[str, Any]:
    return {"questions": MOCK_QUESTIONS}


def _post_json(url: str, body: dict[str, Any]) -> bytes:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=_HTTP_TIMEOUT_SECONDS) as response:
        return response.read()


def _post_multipart(url: str, fields: dict[str, str], filename: str, content: bytes) -> bytes:
    """Минимальная сборка multipart/form-data — в stdlib нет готового клиента для неё."""
    boundary = f"----ainterviewer{uuid.uuid4().hex}"
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
        )
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode()
    )
    parts.append(content)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)

    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=_HTTP_TIMEOUT_SECONDS) as response:
        return response.read()


@router.post("/speak")
async def speak(payload: SpeakRequest) -> Response:
    """Текст вопроса → аудио (self-hosted TTS, OpenAI-совместимый /v1/audio/speech)."""
    url = f"{settings.tts_base_url.rstrip('/')}/audio/speech"
    body = {
        "model": settings.tts_model,
        "voice": settings.tts_voice,
        "input": payload.text,
        "response_format": "mp3",
    }
    try:
        audio = await run_in_threadpool(_post_json, url, body)
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"TTS недоступен ({url}): {exc}") from exc

    return Response(content=audio, media_type="audio/mpeg")


@router.post("/transcribe")
async def transcribe(request: Request) -> dict[str, str]:
    """Аудио ответа кандидата → текст (self-hosted STT, /v1/audio/transcriptions).

    Аудио принимается сырым телом запроса, а не `multipart/form-data`: разбор форм в
    FastAPI требует пакета `python-multipart`, которого нет в окружении, а добавить его
    сейчас нельзя — PyPI с этой машины недоступен. Для одного файла в теле форма и не
    нужна; multipart собирается уже здесь, на пути к STT (`_post_multipart`).
    """
    url = f"{settings.stt_base_url.rstrip('/')}/audio/transcriptions"
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="пустое тело запроса — нет аудио")
    filename = request.headers.get("x-audio-filename", "answer.webm")
    try:
        raw = await run_in_threadpool(
            _post_multipart,
            url,
            {"model": settings.stt_model, "language": settings.stt_language, "response_format": "json"},
            filename,
            content,
        )
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"STT недоступен ({url}): {exc}") from exc

    try:
        return {"text": json.loads(raw).get("text", "")}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="STT вернул не JSON") from exc


# --- прокси к драйверу графа live-контура -----------------------------------------
#
# Backend НЕ принимает решений о переходах и не хранит состояние интервью (FR-011) —
# и в mock-режиме тоже. Всё, что делают два эндпоинта ниже: передают распознанный текст
# реплики в `live-agent` (модуль `ainterviewer.mock_driver`, который крутит настоящий
# `LiveContourEngine`) и возвращают браузеру то, что решил граф, как есть.


def _driver_url(path: str) -> str:
    return f"{settings.live_agent_driver_url.rstrip('/')}{path}"


def _proxy_driver(url: str, body: dict[str, Any]) -> tuple[int, bytes]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=_HTTP_TIMEOUT_SECONDS) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        # Ошибки самого драйвера (404 «сессия не начата», 409 «уже завершено») — это
        # осмысленные ответы, а не сбой связи: пробрасываем как есть, не подменяя.
        return exc.code, exc.read()


@router.post("/session/{session_id}/start")
async def start_session(session_id: str) -> Response:
    url = _driver_url(f"/session/{session_id}/start")
    try:
        status, raw = await run_in_threadpool(_proxy_driver, url, {})
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"live-agent driver недоступен ({url}): {exc}") from exc
    return Response(content=raw, status_code=status, media_type="application/json")


@router.post("/session/{session_id}/turn")
async def submit_turn(session_id: str, payload: TurnRequest) -> Response:
    url = _driver_url(f"/session/{session_id}/turn")
    try:
        status, raw = await run_in_threadpool(_proxy_driver, url, {"text": payload.text})
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"live-agent driver недоступен ({url}): {exc}") from exc
    return Response(content=raw, status_code=status, media_type="application/json")
