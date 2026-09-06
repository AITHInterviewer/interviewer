# ruff: noqa: E501
"""Переписать мок-отчёты демо-кандидатов на канон evaluation-agent (шкала 0–3).

Живых кандидатов не трогает: только фиксированный список имён с трёх демо-вакансий.
Идемпотентно. Не коммитит секреты — для HTTP-режима берёт их из env.

Запуск на VPS (ответы + события + отчёт), из контейнера backend:

    uv run python -m scripts.refresh_mock_candidate_reports

С этой машины (только report_json через API, без расшифровок):

    BACKEND_URL=https://ainterviewer.duckdns.org:12345 \\
    ADMIN_EMAIL=... ADMIN_PASSWORD=... EVALUATION_SERVICE_TOKEN=dev-evaluation-token \\
    python3 -m scripts.refresh_mock_candidate_reports --via-api
"""

from __future__ import annotations

import argparse
import json
import os
import random
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

MOCK_VACANCY_TITLES = (
    "Middle+ Python-разработчик",
    "Frontend-разработчик (React / Next.js)",
    "Product Manager",
)

MOCK_CANDIDATE_NAMES = frozenset(
    {
        "Анна Соколова",
        "Максим Лебедев",
        "Павел Юрьев",
        "Ирина Волкова",
        "Лидия Орлова",
        "Дмитрий Козлов",
        "Елена Морозова",
        "Никита Белов",
        "Артём Новиков",
        "София Крылова",
        "Ольга Смирнова",
        "Кирилл Васильев",
        "Мария Кузнецова",
    }
)

SKIP_STATES = frozenset({"declined", "expired", "consent_revoked", "data_deleted"})

# Копия evaluation-agent/src/evaluation_agent/scoring.py — в образе backend пакета агента нет.
SCORE_WEIGHTS = (12, 22, 40, 26)  # 0..3, чаще «уверенно», реже полный провал


@dataclass(frozen=True)
class InterviewScore:
    question_score: float
    skill_score: float
    max_score: float
    score_percent: int
    skill_levels: list[dict[str, int | str]]
    verdict: str


def calculate_interview_score(
    *,
    question_ids: list[str],
    skill_scores_by_question: dict[str, list[tuple[str, int]]],
    required_skills: list[str],
    nice_to_have_skills: list[str],
    has_contradictions: bool,
) -> InterviewScore:
    per_skill: dict[str, list[int]] = {}
    scored_questions = 0
    question_points = 0.0
    for question_id in question_ids:
        scores = skill_scores_by_question.get(question_id, [])
        if scores:
            scored_questions += 1
            question_points += sum(score for _, score in scores) / len(scores)
        for skill, score in scores:
            per_skill.setdefault(skill.casefold(), []).append(score)

    skill_levels: list[dict[str, int | str]] = []
    skill_points = 0.0
    skill_max = 0.0
    for skill, weight in (
        *[(item, 2.0) for item in required_skills],
        *[(item, 0.5) for item in nice_to_have_skills],
    ):
        values = per_skill.get(skill.casefold(), [])
        if not values:
            continue
        level = max(0, min(3, round(sum(values) / len(values))))
        skill_points += level / 3 * weight
        skill_max += weight
        skill_levels.append({"skill_tag": skill, "level": level})

    max_score = scored_questions * 3 + skill_max
    total = question_points + skill_points
    percent = round(total / max_score * 100) if max_score else 0
    if has_contradictions or percent == 60:
        verdict = "needs_review"
    elif percent > 60:
        verdict = "fits"
    else:
        verdict = "not_fits"
    return InterviewScore(question_points, skill_points, max_score, percent, skill_levels, verdict)


def _pick_score(rng: random.Random) -> int:
    return rng.choices((0, 1, 2, 3), weights=SCORE_WEIGHTS, k=1)[0]


def _rationale(skill: str, score: int) -> str:
    if score >= 3:
        return f"По «{skill}» опирается на прод-опыт и закрывает intent вопроса."
    if score == 2:
        return f"По «{skill}» схема в целом верная, не хватает пары рабочих деталей."
    if score == 1:
        return f"По «{skill}» есть отдельные верные слова, без рабочей схемы."
    return f"По «{skill}» ответ общий, ключевых шагов нет."


def _report_line(score: int) -> str:
    if score >= 3:
        return "Ответ собранный: есть шаги, ограничения и как проверял бы в проде."
    if score == 2:
        return "Рабочий ответ среднего уровня: направление верное, мало конкретики."
    if score == 1:
        return "Поверхностно: кандидат узнаёт тему, но не собирает решение."
    return "Не подтвердил, что делал это руками."


def _quote(text: str, limit: int = 180) -> str:
    chunk = " ".join(text.split())
    if len(chunk) <= limit:
        return chunk
    return chunk[: limit - 1].rstrip() + "…"


def _answers_for(question_text: str, score: int) -> list[str]:
    text = question_text.lower()
    if "последнем проекте" in text or "зона ответственности" in text:
        return [
            "В последнем проекте я была единственным бэкендером на биллинге: FastAPI, Postgres, выгрузки. Зона — API и инциденты ночью.",
            "Делал сервис уведомлений. Больше писал ручки и тесты, до брокера редко доходил.",
            "Работал в большой команде, мои задачи были мелкие. Про архитектуру расскажу общими словами.",
        ]
    if "kafka" in text or "без потери" in text:
        return [
            "Consumer group, ручной commit после записи в Postgres в одной идемпотентной транзакции. Ключ — event_id, таблица inbox. Если нужно exactly-once снаружи — outbox: пишем событие в ту же транзакцию, что и бизнес-строку, отдельный паблишер ретраит. DLQ и алерт, если ретраи кончились. At-least-once как базовый контракт.",
            "Подпишусь consumer group, после обработки сделаю commit. Если упадём — сообщение придёт ещё раз, поэтому обработчик по id события. Outbox пока не делал, но понимаю зачем.",
            "Поставлю Kafka и буду писать в базу. Если что — перечитаю топик с начала. Про consumer group слышал.",
            "Наверное Kafka сама не теряет, я просто вызову produce и всё.",
        ]
    if "медленный sql" in text or "explain" in text:
        return [
            "Сначала pg_stat_statements и EXPLAIN ANALYZE. Смотрю seq scan vs index, row estimate, buffers. Потом статистика ANALYZE, нет ли lock/wait в pg_stat_activity. Если раздутый индекс — пересобрать. В проде не гадаю по ощущениям.",
            "Открою EXPLAIN, если seq scan — добавлю индекс. Иногда помогает LIMIT. До логов локов редко доходил.",
            "Увеличу таймаут и перезапущу запрос. Если не поможет — попрошу DBA.",
            "Напишу запрос иначе, без плана. Индексы добавляю наугад.",
        ]
    if "состояние формы" in text or "валидац" in text:
        return [
            "Контролируемые поля, схема (zod/yup) на клиенте, ошибки API маплю на поля, не в общий тост. Состояние: dirty/submitting/serverErrors отдельно от значений. После 422 не затираю ввод, кнопка снова активна. В Next.js экшен или route handler, ревалидация только после успеха.",
            "Форма на useState, валидация перед submit, ошибку сервера показываю сверху. Для полей хочу когда-нибудь react-hook-form.",
            "Один большой стейт на всё. Если сервер вернул ошибку — alert. Про схему валидации не думал.",
            "Просто input и onClick. Ошибки полей не делал.",
        ]
    if "регресс вёрстки" in text or "доступности" in text:
        return [
            "Playwright на критичные сценарии, RTL на логику формы. Перед релизом — клавиатура, роли ARIA, контраст. Скриншот-дифф на ключевых экранах. A11y не «потом», а в чек-листе PR.",
            "Есть парочка e2e и глазами смотрю. Про ARIA знаю, но не каждый экран проверяю.",
            "Вручную в Chrome. Автотестов почти нет.",
            "Отдаю дизайнеру, сам не проверяю доступность.",
        ]
    if "нового экрана" in text or "начинаете новый" in text:
        return [
            "С состояний и пустого экрана: что видит пользователь, какие запросы, потом вёрстка. Токены и готовые компоненты, не с пикселя.",
            "С макета в Figma и сразу jsx. Состояния ошибок добавляю позже.",
            "Копирую похожий экран и меняю тексты.",
        ]
    if "ревью и деплоя" in text:
        return [
            "Короткий PR, превью-стенд, поверх — канарейка. Ревью по поведению, не по вкусу нейминга.",
            "Обычный GitHub Flow, деплой из main. Ревью иногда формальное.",
            "Как скажете в команде, мне без разницы.",
        ]
    if "продукт, которым гордитесь" in text or "вашу роль" in text:
        return [
            "Онбординг в B2B: упала активация, я собрала интервью, отрезала лишние шаги, замерила time-to-value. Моя роль — гипотеза, приоритизация, запуск с разработкой.",
            "Делал лендинг и бэклог по запросам продаж. Горжусь, что быстро катили, но метрику смотрели редко.",
            "Больше помогал команде с задачами, продуктовых решений сам не принимал.",
        ]
    if "какую фичу делать следующей" in text or "продажи — другое" in text:
        return [
            "Сначала проблема, не «чья громче». Гипотеза, impact/effort, риск, откуда сигнал. Если метрика не растёт — сначала диагностика, не новая фича. После релиза — одна проверяемая метрика и срок, когда признаём провал.",
            "Соберу три запроса в таблицу, оценю effort с разработкой, выберу среднее. Метрику поставлю потом.",
            "Сделаю то, что просят продажи — они ближе к деньгам. Разработку уговорю.",
            "Поставлю голосование в чате и пойду за большинством.",
        ]
    if "онбординг-воронки" in text or "какую метрику" in text:
        return [
            "Activation: доля тех, кто за окно N дней дошёл до первого ценного действия, не визиты. Сегмент новых, без старых пользователей. Слежу, чтобы не улучшить клики ценой качества. Vanity — сырой трафик — не ставлю целью эксперимента.",
            "Конверсию из регистрации в оплату. Окно — месяц. Почему не другую — привычнее считать.",
            "Число регистраций. Если вырастет — значит онбординг лучше.",
            "Поставлю NPS, так нагляднее.",
        ]
    if "красным флагом" in text:
        return [
            "Если решения идут от самого громкого, а не от проблемы, и после релиза никто не смотрит метрику. Ещё — нет права сказать «не делаем».",
            "Микроменеджмент и вечные совещания без решений.",
            "Сложно сказать, посмотрим по месту.",
        ]
    if "уточнить про команду" in text:
        return [
            "Как устроены дежурства и кто владеет схемой базы. Есть ли время на техдолг после инцидента.",
            "Какой график и можно ли удалёнку.",
            "Пока вопросов нет.",
        ]
    generic = [
        "Расскажу, как делал это на прошлом месте: сначала воспроизвести, потом узкое место, потом проверка, что не сломали соседнее.",
        "В общих чертах понимаю, на проде сам настраивал мало.",
        "С этим почти не сталкивался, могу только предположить.",
    ]
    if score >= 3:
        return generic[:1]
    if score == 2:
        return generic[:1]
    if score == 1:
        return generic[1:2]
    return generic[2:]


def transcript_for(question_text: str, score: int, rng: random.Random) -> str:
    options = _answers_for(question_text, score)
    if score >= 3:
        pool = options[:1] if len(options) > 1 else options
    elif score == 2:
        pool = options[1:2] or options[:1]
    elif score == 1:
        pool = options[2:3] or options[-2:-1] or options
    else:
        pool = options[-1:]
    return rng.choice(pool)


def build_report(
    *,
    candidate_name: str,
    questions: list[dict[str, Any]],
    required_skills: list[str],
    nice_to_have_skills: list[str],
    rng: random.Random,
    now: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, str]]:
    """Возвращает тело EvaluationCreateRequest и map question_id → расшифровка."""

    stamp = now or datetime.now(timezone.utc)
    transcripts: dict[str, str] = {}
    per_question: list[dict[str, Any]] = []
    skill_scores_by_question: dict[str, list[tuple[str, int]]] = {}
    assessment_ids: list[str] = []

    for question in sorted(questions, key=lambda item: int(item.get("order") or 0)):
        question_id = str(question["id"])
        role = question.get("role") or "assessment"
        tags = [tag for tag in (question.get("skill_tag") or []) if isinstance(tag, str) and tag.strip()]
        if role != "assessment" or not tags:
            preview_score = rng.choice((1, 2, 3))
            transcripts[question_id] = transcript_for(question.get("text") or "", preview_score, rng)
            continue
        assessment_ids.append(question_id)
        scores = [(tag, _pick_score(rng)) for tag in tags]
        skill_scores_by_question[question_id] = scores
        avg = round(sum(item[1] for item in scores) / len(scores))
        answer = transcript_for(question.get("text") or "", avg, rng)
        transcripts[question_id] = answer
        per_question.append(
            {
                "question_id": question_id,
                "skill_scores": [
                    {"skill_tag": tag, "score": score, "rationale": _rationale(tag, score)} for tag, score in scores
                ],
                "quotes": [{"text": _quote(answer), "question_id": question_id}],
                "confidence": round(rng.uniform(0.72, 0.96), 2),
                "answered_with_hint": rng.random() < 0.12,
                "report": _report_line(avg),
            }
        )

    score = calculate_interview_score(
        question_ids=assessment_ids,
        skill_scores_by_question=skill_scores_by_question,
        required_skills=required_skills,
        nice_to_have_skills=nice_to_have_skills,
        has_contradictions=False,
    )
    confirmed = [item["skill_tag"] for item in score.skill_levels if int(item["level"]) >= 2]
    unconfirmed = [item["skill_tag"] for item in score.skill_levels if int(item["level"]) < 2]
    payload = {
        "per_question": per_question,
        "overall_score": score.score_percent,
        "question_score": score.question_score,
        "skill_score": score.skill_score,
        "max_score": score.max_score,
        "score_percent": score.score_percent,
        "skill_levels": score.skill_levels,
        "verdict": score.verdict,
        "confirmed_skills": confirmed,
        "unconfirmed_skills": unconfirmed,
        "contradictions_found": [],
        "strengths": [f"Подтверждён навык: {tag}" for tag in confirmed],
        "risks": [f"Не подтверждён навык: {tag}" for tag in unconfirmed],
        "summary_intro": f"{candidate_name}: {score.score_percent}% от шкалы вакансии.",
        "summary_conclusion": "Итог считает ответы на вопросы и взвешенную матрицу навыков. Мок-отчёт по канону 0–3.",
        "model_version": "mock-canon-v1",
        "prompt_version": "mock",
        "generated_at": stamp.isoformat(),
    }
    return payload, transcripts


def _is_mock(name: str | None, product_state: str | None) -> bool:
    if not name or name not in MOCK_CANDIDATE_NAMES:
        return False
    return (product_state or "") not in SKIP_STATES


def run_via_api(base: str, admin_email: str, admin_password: str, service_token: str) -> None:
    ctx = ssl.create_default_context()

    def req(method: str, path: str, body: Any = None, token: str | None = None, service: bool = False) -> tuple[int, Any]:
        data = None if body is None else json.dumps(body).encode()
        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if service:
            headers["X-Service-Token"] = service_token
        request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, context=ctx, timeout=60) as resp:
                raw = resp.read().decode()
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode()
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                parsed = {"raw": raw[:800]}
            return exc.code, parsed

    status, login = req("POST", "/api/v1/auth/login", {"email": admin_email, "password": admin_password})
    if status != 200 or "access_token" not in login:
        raise SystemExit(f"login failed: HTTP {status} {login}")
    token = login["access_token"]
    status, listed = req("GET", "/api/v1/vacancies", token=token)
    if status != 200:
        raise SystemExit(f"list vacancies: HTTP {status} {listed}")
    updated = []
    for vacancy_row in listed.get("items") or []:
        if vacancy_row.get("title") not in MOCK_VACANCY_TITLES:
            continue
        vid = vacancy_row["id"]
        status, vacancy = req("GET", f"/api/v1/vacancies/{vid}", token=token)
        if status != 200:
            raise SystemExit(f"get vacancy {vid}: HTTP {status}")
        status, interviews = req("GET", f"/api/v1/vacancies/{vid}/interviews", token=token)
        if status != 200:
            raise SystemExit(f"list interviews {vid}: HTTP {status}")
        for interview in interviews.get("items") or []:
            if not _is_mock(interview.get("candidate_name"), interview.get("product_state")):
                continue
            rng = random.Random(str(interview["id"]))
            payload, _transcripts = build_report(
                candidate_name=interview.get("candidate_name") or "Кандидат",
                questions=vacancy.get("questions") or [],
                required_skills=vacancy.get("required_skills") or [],
                nice_to_have_skills=vacancy.get("nice_to_have_skills") or [],
                rng=rng,
            )
            status, result = req(
                "POST",
                f"/api/v1/interviews/{interview['id']}/evaluation",
                payload,
                service=True,
            )
            if status != 200:
                raise SystemExit(
                    f"evaluation {interview.get('candidate_name')} {interview['id']}: HTTP {status} {result}"
                )
            updated.append(
                {
                    "name": interview.get("candidate_name"),
                    "vacancy": vacancy.get("title"),
                    "percent": payload["score_percent"],
                    "verdict": payload["verdict"],
                }
            )
            print(
                f"OK {interview.get('candidate_name')} {payload['score_percent']}% {payload['verdict']}",
                flush=True,
            )
    print(json.dumps({"updated": updated, "count": len(updated)}, ensure_ascii=False, indent=2))


async def run_via_db() -> None:
    from sqlalchemy import delete, select

    from app.db import SessionLocal
    from app.models.answer import Answer
    from app.models.interview import Interview
    from app.models.interview_event import InterviewEvent
    from app.models.question import Question
    from app.models.vacancy import Vacancy
    from app.schemas.evaluation import EvaluationCreateRequest
    from app.services.evaluation_service import EvaluationService
    from app.services.interview_event_service import InterviewEventService

    updated: list[dict[str, Any]] = []
    async with SessionLocal() as session:
        vacancies = (
            (await session.execute(select(Vacancy).where(Vacancy.title.in_(MOCK_VACANCY_TITLES)))).scalars().all()
        )
        for vacancy in vacancies:
            questions = (
                (
                    await session.execute(
                        select(Question).where(Question.vacancy_id == vacancy.id).order_by(Question.order)
                    )
                )
                .scalars()
                .all()
            )
            question_payload = [
                {
                    "id": str(question.id),
                    "order": question.order,
                    "role": question.role,
                    "skill_tag": list(question.skill_tag or []),
                    "text": question.text,
                }
                for question in questions
            ]
            interviews = (
                (await session.execute(select(Interview).where(Interview.vacancy_id == vacancy.id))).scalars().all()
            )
            for interview in interviews:
                if not _is_mock(interview.candidate_name, interview.product_state):
                    continue
                await session.execute(delete(Answer).where(Answer.interview_id == interview.id))
                await session.execute(delete(InterviewEvent).where(InterviewEvent.interview_id == interview.id))
                await session.commit()

                rng = random.Random(str(interview.id))
                payload, transcripts = build_report(
                    candidate_name=interview.candidate_name or "Кандидат",
                    questions=question_payload,
                    required_skills=list(vacancy.required_skills or []),
                    nice_to_have_skills=list(vacancy.nice_to_have_skills or []),
                    rng=rng,
                )
                events = InterviewEventService(session)
                started = datetime.now(timezone.utc) - timedelta(minutes=40)
                seq = 0

                async def emit(raw: dict[str, Any]) -> None:
                    nonlocal seq
                    seq += 1
                    await events.record_event(
                        interview.id,
                        raw,
                        source_event_id=f"m{str(interview.id).replace('-', '')[:12]}{seq:03d}",
                    )

                await emit(
                    {
                        "type": "agent_utterance",
                        "ts": started.isoformat(),
                        "payload": {
                            "text": "Давайте начнём. Я задам несколько вопросов по вашему опыту.",
                            "kind": "intro",
                        },
                    }
                )
                cursor = started + timedelta(minutes=1)
                for question in questions:
                    qid = str(question.id)
                    answer_text = transcripts[qid]
                    await emit(
                        {
                            "type": "question_started",
                            "question_id": qid,
                            "ts": cursor.isoformat(),
                            "payload": {"text": question.text},
                        }
                    )
                    cursor += timedelta(seconds=20)
                    await emit(
                        {
                            "type": "candidate_utterance",
                            "question_id": qid,
                            "ts": cursor.isoformat(),
                            "payload": {"text": answer_text},
                        }
                    )
                    cursor += timedelta(minutes=2)
                    await emit(
                        {
                            "type": "question_completed",
                            "question_id": qid,
                            "ts": cursor.isoformat(),
                            "payload": {},
                        }
                    )
                await emit(
                    {
                        "type": "agent_utterance",
                        "ts": cursor.isoformat(),
                        "payload": {
                            "text": "Спасибо, на этом закончим. Отчёт появится у рекрутера.",
                            "kind": "closing",
                        },
                    }
                )
                request = EvaluationCreateRequest.model_validate(payload)
                await EvaluationService(session).create_evaluation(interview.id, request)
                interview.status = "completed"
                interview.completed_at = datetime.now(timezone.utc)
                await session.commit()
                updated.append(
                    {
                        "name": interview.candidate_name,
                        "vacancy": vacancy.title,
                        "percent": payload["score_percent"],
                        "verdict": payload["verdict"],
                    }
                )
                print(f"OK {interview.candidate_name} {payload['score_percent']}% {payload['verdict']}", flush=True)
    print(json.dumps({"updated": updated, "count": len(updated)}, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--via-api", action="store_true", help="Пишет только отчёт через POST /evaluation")
    args = parser.parse_args()
    if args.via_api:
        base = os.environ.get("BACKEND_URL", "https://ainterviewer.duckdns.org:12345").rstrip("/")
        email = os.environ.get("ADMIN_EMAIL")
        password = os.environ.get("ADMIN_PASSWORD")
        token = os.environ.get("EVALUATION_SERVICE_TOKEN", "dev-evaluation-token")
        if not email or not password:
            raise SystemExit("ADMIN_EMAIL and ADMIN_PASSWORD are required for --via-api")
        run_via_api(base, email, password, token)
        return
    import asyncio

    asyncio.run(run_via_db())


if __name__ == "__main__":
    main()
