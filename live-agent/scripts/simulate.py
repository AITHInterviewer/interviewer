"""
Прогон графа live-контура без LiveKit/Docker/аудио — только state_machine + мок-данные.

Полезно как: 1) быстрая проверка логики графа при правках, 2) демонстрация того, что
"граф понятен и объясним" — можно прочитать сценарий ниже и один в один сопоставить его
с событиями в out/*.jsonl. По умолчанию использует FakeLLM (без сети/подписки); с флагом
--real дёргает настоящий Claude Agent SDK (нужен `claude login`).

Запуск:
    .venv/Scripts/python.exe scripts/simulate.py
    .venv/Scripts/python.exe scripts/simulate.py --real
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from ainterviewer.events import EventLog  # noqa: E402
from ainterviewer.llm_client import ClaudeAgentSDKLiveControlLLM, FakeLLM  # noqa: E402
from ainterviewer.schema import InterviewInput  # noqa: E402
from ainterviewer.state_machine import LiveContourEngine, Phase  # noqa: E402

# Сценарий: реплики "кандидата" по порядку. Для FakeLLM подобраны так, чтобы пройти
# по всем веткам графа хотя бы раз: незаконченная мысль -> исчерпывающий ответ ->
# короткий неоднозначный ответ -> подтверждение после чек-ина -> "не знаю" (наводящий вопрос).
SCRIPTED_TURNS = [
    "Ну, у нас был случай, когда...",  # CONTINUE
    (
        "Да, у нас был запрос к таблице заказов, который выполнялся 8 секунд. Я прогнал "
        "EXPLAIN ANALYZE, увидел seq scan по customer_id, добавил составной индекс по "
        "customer_id и created_at, время упало до 40 миллисекунд. Про то, что индексы "
        "замедляют запись, тоже помню — на таблицах с частыми инсертами добавляю аккуратно."
    ),  # EXHAUSTIVE
    "Наверное через parent_id.",  # AMBIGUOUS (короткий, неполный)
    "Да, пожалуй это всё, что я хотел сказать.",  # после чек-ина -> EXHAUSTIVE
    "Если честно, не знаю, как тут с Docker в проде поступал.",  # GAP: leading_hint
    "А, ну тогда просто сборка образа и docker-compose up, наверное.",  # EXHAUSTIVE после подсказки
]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--real", action="store_true", help="Использовать настоящий Claude Agent SDK вместо FakeLLM")
    parser.add_argument("--mock", default="mock_data/interview_example.json")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    interview = InterviewInput.model_validate_json((root / args.mock).read_text(encoding="utf-8"))

    out_path = root / "out" / f"{interview.interview_id}.jsonl"
    llm = ClaudeAgentSDKLiveControlLLM() if args.real else FakeLLM()

    with EventLog(out_path) as events:
        engine = LiveContourEngine(interview, llm, events)

        print(f"[AGENT] {await engine.start()}")

        turn_iter = iter(SCRIPTED_TURNS)
        while engine.state.phase != Phase.DONE:
            try:
                candidate_text = next(turn_iter)
            except StopIteration:
                print("[SCENARIO] сценарий закончился раньше интервью — останавливаюсь")
                break

            print(f"[CANDIDATE] {candidate_text}")
            print(f"[AGENT] {engine.backchannel_phrase()}")
            reply = await engine.on_candidate_final_turn(candidate_text)
            if reply:
                print(f"[AGENT] {reply}")

    print(f"\nСобытий записано: {len(events.events)} -> {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
