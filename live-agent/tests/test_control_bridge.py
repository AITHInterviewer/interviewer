"""Регрессия на `live-agent/CLAUDE.md`, правило 5: `RedisEventSink` — аддитивный, файловый
`EventLog`-протокол не меняется ни по формату, ни по содержимому при наличии sink'ов, и
сбой sink'а не роняет `emit()`.

specs/004-candidate-interview-flow/tasks.md, T032 (изначально T034 в первой нумерации;
итоговая нумерация в tasks.md).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ainterviewer.control_bridge import RedisEventSink, redis_channel_name  # noqa: E402
from ainterviewer.events import Event, EventLog, EventType  # noqa: E402


def test_redis_channel_name_is_namespaced_by_interview_id():
    assert redis_channel_name("abc-123") == "live-agent:events:abc-123"


class _RecordingSink:
    """Тестовый двойник `events.EventSink` — фиксирует, какие `Event` до него дошли."""

    def __init__(self):
        self.published: list[Event] = []

    def publish(self, event: Event) -> None:
        self.published.append(event)


class _FailingSink:
    def publish(self, event: Event) -> None:  # noqa: ARG002
        raise RuntimeError("боевой sink недоступен")


def test_eventlog_file_output_unchanged_with_sink_attached(tmp_path):
    """Ключевая регрессия правила 5: одинаковый набор событий (тип/question_id/payload) в
    файле с sink'ом и без — `ts` намеренно исключён из сравнения, т.к. генерируется
    заново на каждый `emit()` (`default_factory=datetime.now`), а не часть инварианта."""

    def rows_without_ts(path: Path) -> list[dict]:
        import json

        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
        for row in rows:
            row.pop("ts", None)
        return rows

    path_without_sink = tmp_path / "no_sink.jsonl"
    log_without_sink = EventLog(path_without_sink)
    log_without_sink.emit(EventType.INTERVIEW_STARTED, payload={"a": 1})
    log_without_sink.emit(EventType.QUESTION_STARTED, question_id="q1", payload={"b": 2})
    log_without_sink.close()

    path_with_sink = tmp_path / "with_sink.jsonl"
    sink = _RecordingSink()
    log_with_sink = EventLog(path_with_sink, sinks=[sink])
    log_with_sink.emit(EventType.INTERVIEW_STARTED, payload={"a": 1})
    log_with_sink.emit(EventType.QUESTION_STARTED, question_id="q1", payload={"b": 2})
    log_with_sink.close()

    assert rows_without_ts(path_without_sink) == rows_without_ts(path_with_sink)
    assert len(sink.published) == 2
    assert sink.published[0].type == EventType.INTERVIEW_STARTED
    assert sink.published[1].question_id == "q1"


def test_eventlog_emit_survives_failing_sink(tmp_path):
    """Sink — вспомогательный канал (control-плоскость), не источник истины — его сбой
    не должен ронять файловый протокол/сам граф (events.py, docstring EventSink)."""
    path = tmp_path / "resilient.jsonl"
    log = EventLog(path, sinks=[_FailingSink()])

    event = log.emit(EventType.INTERVIEW_STARTED, payload={})  # не должно бросить исключение

    log.close()
    assert event.type == EventType.INTERVIEW_STARTED
    assert len(log.events) == 1
    assert path.read_text(encoding="utf-8").strip() != ""


def test_redis_event_sink_without_running_loop_does_not_raise():
    """`publish()` вызывается синхронно из `EventLog.emit()` — вне активного event loop
    (например, из синхронного теста/скрипта) публикация в Redis пропускается, не падает."""

    class _StubRedis:
        async def publish(self, channel, payload):  # pragma: no cover - не должен вызваться
            raise AssertionError("не должно быть вызвано без активного event loop")

    sink = RedisEventSink(_StubRedis(), interview_id="abc")
    event = Event(type=EventType.INTERVIEW_STARTED)

    sink.publish(event)  # не должно бросить исключение


@pytest.mark.asyncio
async def test_redis_event_sink_publishes_same_payload_as_eventlog_file(tmp_path):
    """Payload, ушедший в Redis, идентичен строке, записанной в файл — один и тот же
    `Event.to_jsonl()`, не переизобретённая сериализация."""
    published: list[tuple[str, str]] = []

    class _StubRedis:
        async def publish(self, channel, payload):
            published.append((channel, payload))

    sink = RedisEventSink(_StubRedis(), interview_id="int-42")
    log = EventLog(tmp_path / "events.jsonl", sinks=[sink])

    event = log.emit(EventType.QUESTION_STARTED, question_id="q1", payload={"text": "Вопрос?"})
    # publish() планирует asyncio.Task на текущем loop — даём ему выполниться.
    import asyncio

    await asyncio.sleep(0)

    log.close()
    assert len(published) == 1
    channel, payload = published[0]
    assert channel == "live-agent:events:int-42"
    assert payload == event.to_jsonl()
