"""Тесты `echo_filter.is_likely_echo` — раздел 2 задачи "live-interview quality pass"
(2026-09-05). Чистая функция, без сети/Docker/LiveKit — см. конвенцию test_state_machine.py."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ainterviewer.echo_filter import is_likely_echo  # noqa: E402


def test_exact_repeat_is_echo():
    agent = "Расскажите про свой продакшн-сервис на Python с очередью."
    assert is_likely_echo(agent, agent) is True


def test_unrelated_short_reply_is_not_echo():
    agent = "Расскажите про свой продакшн-сервис на Python с очередью."
    candidate = "Да, конечно, использовал Kafka в прошлом проекте."
    assert is_likely_echo(candidate, agent) is False


def test_empty_candidate_text_is_not_echo():
    assert is_likely_echo("", "Расскажите про свой опыт.") is False


def test_empty_agent_utterance_is_not_echo():
    assert is_likely_echo("Да, использовал Kafka", "") is False


def test_genuine_new_sentence_sharing_a_few_words_is_not_echo():
    # Общее слово "Kafka" не должно давать ложное срабатывание на короткий, но
    # самостоятельный ответ кандидата.
    agent = "Расскажите про свой продакшн-сервис на Python с очередью — Kafka или RabbitMQ."
    candidate = "Да, использовал Kafka."
    assert is_likely_echo(candidate, agent) is False
