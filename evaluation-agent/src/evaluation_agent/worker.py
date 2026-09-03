"""Точка входа воркера — каркас, НЕ реализован. Раздел 3 архитектурного документа:
batch-контур асинхронно, после `interview_completed`, точный ASR + LLM-оценка по рубрике.

Единственная реально работающая часть логики — `verdict.py` (правило раздела 5.1),
здесь она только вызывается по месту. Всё остальное ниже — явный каркас с TODO, не
выдаю его за готовое (см. README, раздел «Статус»).
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


async def run_worker() -> None:
    """Основной цикл. TODO по шагам, соответствующим разделу 3:

    1. Слушать очередь (Redis) на событие `interview_completed` от live-agent —
       сейчас live-agent пишет `EventLog` в локальный `out/*.jsonl` (см.
       `live-agent/src/ainterviewer/events.py`), это нужно переключить на публикацию
       в очередь, чтобы evaluation-agent мог реагировать, не читая файлы с диска.
    2. По `interview_id` — получить `Answer.audio_url` из backend API (или из объектного
       хранилища напрямую) и таймстампы `question_started`/`question_completed` из
       протокола событий live-agent, чтобы порезать общий аудио-файл на интервалы
       (раздел 4/раздел «Как реально пишется запись» архитектурного документа).
    3. Прогнать точный ASR (WhisperX/faster-whisper с большой моделью — то место, для
       которого и предназначен large-v3-turbo, который оказался слишком медленным для
       live-agent, см. live-agent/docker-compose.yml) со словарём терминов вакансии.
    4. LLM-оценка по рубрике на каждый вопрос -> `QuestionScore` (см. `schema.py`).
    5. `verdict.aggregate_skills()` + `verdict.compute_verdict()` — уже реализовано.
    6. Записать `Evaluation` через backend API (`POST /interviews/{id}/evaluation` —
       роутера пока нет ни здесь, ни в backend, см. backend/README.md TODO).
    """
    raise NotImplementedError(
        "Воркер не реализован — см. TODO в докстринге run_worker(). "
        "Работающая часть сервиса — evaluation_agent.verdict, см. tests/test_verdict.py."
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
