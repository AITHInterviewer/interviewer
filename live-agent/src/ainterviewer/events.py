"""
Протокол событий live-контура.

Итог работы live-контура — не готовая оценка (это работа batch-контура, которого пока нет),
а лог событий: JSON Lines, один файл на интервью, одна строка — одно событие. Batch-контур
в будущем читает этот файл и по нему восстанавливает: полную историю по каждому вопросу,
все точные (не черновые) транскрипты после нормального ASR, какие адаптивные вопросы
сработали и почему — и уже на этом строит `skill_scores`/`verdict` по правилу из раздела 5.1
архитектурного документа.

Почему просто JSONL, а не сразу пишем в Answer/Evaluation по схеме из раздела 4: live-контур
работает с черновым ASR (раздел 3: «черновой транскрипт... не переиспользуется для финальной
оценки»), так что было бы неверно писать эти черновые данные в те же поля, что и точную
батч-оценку. Событийный лог — черновой, сырой источник; итоговые сущности собирает batch-контур.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, Enum):
    INTERVIEW_STARTED = "interview_started"
    QUESTION_STARTED = "question_started"
    BACKCHANNEL_PLAYED = "backchannel_played"
    CANDIDATE_UTTERANCE = "candidate_utterance"
    LIVE_CONTROL_DECISION = "live_control_decision"
    AGENT_UTTERANCE = "agent_utterance"
    ADAPTIVE_QUESTION_ASKED = "adaptive_question_asked"
    CHECKIN_USED = "checkin_used"
    QUESTION_COMPLETED = "question_completed"
    INTERVIEW_COMPLETED = "interview_completed"


class Event(BaseModel):
    type: EventType
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))
    question_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)

    def to_jsonl(self) -> str:
        return self.model_dump_json(exclude_none=True)


class EventLog:
    """Пишет события в JSONL-файл по мере появления (append), плюс держит их в памяти
    для удобства локальной отладки/тестов (`EventLog.events`)."""

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.events: list[Event] = []
        # 'w' — новый файл на каждый запуск интервью; путь должен быть уникален на interview_id.
        self._fh = self.path.open("w", encoding="utf-8")

    def emit(self, type: EventType, question_id: str | None = None, payload: dict[str, Any] | None = None) -> Event:
        event = Event(type=type, question_id=question_id, payload=payload or {})
        self.events.append(event)
        self._fh.write(event.to_jsonl() + "\n")
        self._fh.flush()
        return event

    def close(self) -> None:
        self._fh.close()

    def __enter__(self) -> "EventLog":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


def read_events(path: Path) -> list[dict[str, Any]]:
    """Утилита для batch-контура (и для тестов) — читает JSONL обратно в список dict."""
    events = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events
