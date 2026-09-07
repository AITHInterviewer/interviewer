"""
Граф live-контура — раздел 2.3 (шаги 3–7) и 2.3.1 архитектурного документа, урезанные до
подмножества, для которого хватает контекста "только текущий вопрос" (см. schema.GapType).

Явный конечный автомат, а не LLM с тулами — см. README, раздел "Почему без тулов": ветвление
графа целиком в этом файле, обычным Python-кодом, поэтому его можно прочитать, протестировать
и объяснить без необходимости гадать, что решит модель. LLM отвечает только за КЛАССИФИКАЦИЮ
одной реплики и текст ОДНОЙ фразы — см. llm_client.LiveControlLLM.decide().

Состояния:
    ASKING          -> агент проговаривает вопрос/фразу, кандидат слушает
    LISTENING       -> ждём реплику кандидата (границу хода определяет STT/VAD снаружи)
    CODING          -> format="live_coding": кандидат решает задачу в редакторе, не в диалоге
    DONE            -> вопросы закончились

Между ASKING и LISTENING для одного вопроса цикл может провернуться много раз — это и есть
"реактивный цикл": после каждой паузы либо уходим в GAP/AMBIGUOUS (снова ASKING короткой
фразы, затем снова LISTENING), либо в EXHAUSTIVE (уходим со следующего вопроса).

Бюджеты (раздел 2.3.1): не более 1 чек-ина подряд на вопрос, не более 1 подсказки (leading_hint)
на вопрос, суммарный адаптивный бюджет на всё интервью — см. `InterviewState.adaptive_budget`.

Для format="live_coding" (`Phase.CODING`) действует ОТДЕЛЬНЫЙ, per-question набор жёстких
лимитов — `CODING_HINT_LIMIT`/`CODING_FOLLOWUP_LIMIT` ниже — не связанный с бюджетами выше:
подсказки во время решения задачи и доп. вопросы на фазе объяснения решения считаются отдельно
от обычных voice-вопросов.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum, auto

from .events import EventLog, EventType
from .llm_client import LiveControlLLM
from .prompts import (
    BACKCHANNEL_PHRASES,
    CHECKIN_PHRASES,
    CODING_SYSTEM_PROMPT,
    EXHAUSTIVE_TRANSITION_PHRASES,
    EXPLAIN_SOLUTION_PHRASES,
    GAP_TYPE_LABELS,
    NUDGE_PHRASES,
    SYSTEM_PROMPT,
    build_coding_prompt,
    build_turn_prompt,
)
from .schema import Decision, GapType, InterviewInput, Question

# Жёсткие per-question лимиты для format="live_coding" (см. докстринг модуля) — отдельные от
# InterviewState.adaptive_budget_remaining/QuestionRunState.hint_used, которые остаются
# только для обычных voice-вопросов.
CODING_HINT_LIMIT = 3
CODING_FOLLOWUP_LIMIT = 3


class Phase(Enum):
    ASKING = auto()
    LISTENING = auto()
    CODING = auto()
    DONE = auto()


@dataclass
class QuestionRunState:
    """Состояние, которое живёт ровно одно (текущее) прохождение вопроса и сбрасывается
    при переходе на следующий — буквально то, что значит "контекст = только текущий вопрос"."""

    question: Question
    dialogue: list[str] = field(default_factory=list)  # реплики кандидата ТОЛЬКО по этому вопросу
    checkin_used: bool = False
    hint_used: bool = False
    nudge_used: bool = False  # подсказка-«разговорите» на половине лимита времени, не более одной
    # -- только для format="live_coding" (Phase.CODING) --
    code: str = ""  # последняя известная версия кода кандидата по этому вопросу
    hints_used: int = 0  # лимит CODING_HINT_LIMIT, общий для голосовых и "по тишине" подсказок
    followups_used: int = 0  # доп. вопросы на фазе объяснения, лимит CODING_FOLLOWUP_LIMIT
    last_coding_activity: float = field(default_factory=time.monotonic)


@dataclass
class InterviewState:
    input: InterviewInput
    question_index: int = 0
    adaptive_budget_remaining: int = 4  # раздел 2.3.1: суммарный бюджет 3-4 за интервью
    current: QuestionRunState | None = None
    phase: Phase = Phase.ASKING

    @property
    def current_question(self) -> Question:
        return self.input.questions[self.question_index]

    @property
    def is_last_question(self) -> bool:
        return self.question_index >= len(self.input.questions) - 1


class LiveContourEngine:
    """Оркестратор графа. Один экземпляр на одно интервью.

    `agent.py` (слой LiveKit) вызывает `start()` один раз и затем `on_candidate_final_turn()`
    каждый раз, когда фреймворк решил, что кандидат закончил очередную реплику (это и есть
    наш триггер "пауза" из раздела 3 архитектурного документа — LiveKit сам делает VAD/turn
    detection, мы этот сигнал не переизобретаем).

    Оба метода возвращают `AgentAction` — что именно сказать (или ничего) — этот слой
    и есть единственная точка, где решения LLM превращаются в речь/переход состояния.
    """

    def __init__(self, interview: InterviewInput, llm: LiveControlLLM, events: EventLog):
        self.state = InterviewState(input=interview)
        self.llm = llm
        self.events = events

    # -- публичный API -----------------------------------------------------

    async def start(self) -> str:
        """Возвращает первую фразу для TTS (вступление + первый вопрос)."""
        self.events.emit(EventType.INTERVIEW_STARTED, payload={
            "vacancy_title": self.state.input.vacancy.title,
            "candidate_name": self.state.input.candidate.name,
            "questions_total": len(self.state.input.questions),
        })
        return await self._enter_question()

    async def on_candidate_final_turn(self, text: str) -> str | None:
        """Кандидат закончил реплику (final STT-транскрипт одного хода).
        Возвращает текст, который агент должен произнести дальше, либо None
        (тишина/бэкчаннел уже проигран отдельно, слоем выше — см. agent.py)."""
        assert self.state.current is not None
        cur = self.state.current
        cur.dialogue.append(text)

        self.events.emit(
            EventType.CANDIDATE_UTTERANCE,
            question_id=cur.question.id,
            payload={"text": text, "turn_index": len(cur.dialogue)},
        )

        if self.state.phase == Phase.CODING:
            # Кандидат решает задачу — это не обычный ход диалога, см. _handle_coding_utterance
            # и CODING_SYSTEM_PROMPT (набор допустимых решений здесь другой).
            cur.last_coding_activity = time.monotonic()
            return await self._handle_coding_utterance(text)

        # Для live_coding-вопроса это уже фаза объяснения (после _leave_coding) — код,
        # написанный по ЭТОМУ ЖЕ вопросу, часть его контекста (см. prompts.py, докстринг).
        code = cur.code if cur.question.format == "live_coding" else None
        turn_prompt = build_turn_prompt(self.state.input.vacancy, cur.question, cur.dialogue, code=code)
        decision = await self.llm.decide(SYSTEM_PROMPT, turn_prompt)

        self.events.emit(
            EventType.LIVE_CONTROL_DECISION,
            question_id=cur.question.id,
            payload={
                "decision": decision.decision.value,
                "gap_type": decision.gap_type.value if decision.gap_type else None,
                "reasoning": decision.reasoning,
                "adaptive_budget_remaining": self.state.adaptive_budget_remaining,
            },
        )

        return await self._act_on_decision(decision)

    def backchannel_phrase(self) -> str:
        """Мгновенная не-LLM реакция, проигрывается слоем agent.py сразу по получении
        финальной реплики, ДО вызова on_candidate_final_turn — раздел 9.2, п.4."""
        import random

        phrase = random.choice(BACKCHANNEL_PHRASES)
        self.events.emit(
            EventType.BACKCHANNEL_PLAYED,
            question_id=self.state.current.question.id if self.state.current else None,
            payload={"phrase": phrase},
        )
        return phrase

    def silence_timer_enabled(self) -> bool:
        """Таймер отведённого времени крутится только для обычных (assessment) вопросов —
        разминочный/завершающий просто ждут ответа сколько нужно."""
        cur = self.state.current
        return cur is not None and cur.question.role == "assessment"

    def time_limit_sec(self) -> int:
        return self.state.current_question.estimated_duration_sec

    def nudge(self) -> str | None:
        """Половина отведённого времени прошла, кандидат не сказал ни слова — одна мягкая
        попытка разговорить. Возвращает фразу для TTS либо None (уже подсказывали / кандидат
        уже начал отвечать / вопросы кончились)."""
        import random

        cur = self.state.current
        if cur is None or cur.nudge_used or cur.dialogue or self.state.phase == Phase.DONE:
            return None
        cur.nudge_used = True
        phrase = random.choice(NUDGE_PHRASES)
        self.events.emit(EventType.NUDGE_PLAYED, question_id=cur.question.id, payload={"text": phrase})
        self._say(cur.question.id, "nudge", phrase)
        return phrase

    async def skip_current_question(self, reason: str) -> str | None:
        """Принудительный переход к следующему вопросу — по кнопке «Дальше» от кандидата
        или по истечении отведённого времени. Возвращает переходную фразу + следующий
        вопрос (как `_advance_to_next_question`), либо None если интервью уже завершено."""
        if self.state.current is None or self.state.phase == Phase.DONE:
            return None
        return await self._advance_to_next_question(reason=reason)

    def update_code(self, content: str) -> None:
        """Кандидат изменил код в редакторе (format="live_coding") — вызывается из agent.py по
        получении `code_update` из Redis-команд. No-op вне активного вопроса; не эмитит событие
        на каждое изменение (это было бы слишком часто) — снапшоты фиксирует backend отдельно
        (`interview_event_service.record_candidate_input`), финальная версия попадает в протокол
        live-agent при переходе к объяснению (см. `_leave_coding`)."""
        if self.state.current is None:
            return
        self.state.current.code = content
        self.state.current.last_coding_activity = time.monotonic()

    async def maybe_request_coding_hint(self) -> str | None:
        """Дёргается таймером из agent.py при обнаруженном затишье во время `Phase.CODING`
        (код не менялся, реплик не было) — не более `CODING_HINT_LIMIT` раз суммарно с
        голосовыми подсказками (общий счётчик, см. `_give_coding_hint`)."""
        cur = self.state.current
        if cur is None or self.state.phase != Phase.CODING or cur.hints_used >= CODING_HINT_LIMIT:
            return None
        turn_prompt = build_coding_prompt(
            self.state.input.vacancy,
            cur.question,
            cur.code,
            cur.dialogue,
            silence_note="Кандидат уже некоторое время молчит и не меняет код.",
        )
        decision = await self.llm.decide(CODING_SYSTEM_PROMPT, turn_prompt)
        self.events.emit(
            EventType.LIVE_CONTROL_DECISION,
            question_id=cur.question.id,
            payload={
                "decision": decision.decision.value,
                "gap_type": decision.gap_type.value if decision.gap_type else None,
                "reasoning": decision.reasoning,
                "trigger": "silence",
            },
        )
        if decision.decision == Decision.GAP and decision.gap_type == GapType.CODING_HINT:
            return await self._give_coding_hint(decision.utterance, trigger="silence")
        return None

    async def force_finish_coding(self, reason: str) -> str | None:
        """Принудительный переход из решения к объяснению по истечении отведённого на вопрос
        времени — вызывается из agent.py, аналог `skip_current_question`, но не пропускает
        вопрос целиком, а переводит в фазу объяснения (см. `_leave_coding`)."""
        return await self._leave_coding(reason)

    # -- внутренняя логика графа --------------------------------------------

    async def _handle_coding_utterance(self, text: str) -> str | None:
        """Реплика кандидата ВО ВРЕМЯ решения задачи (Phase.CODING) — не обычный ход диалога,
        см. CODING_SYSTEM_PROMPT: классифицирует ровно на continue/gap(coding_hint)/coding_done,
        не на continue/exhaustive/ambiguous/gap основного цикла."""
        cur = self.state.current
        assert cur is not None
        turn_prompt = build_coding_prompt(self.state.input.vacancy, cur.question, cur.code, cur.dialogue)
        decision = await self.llm.decide(CODING_SYSTEM_PROMPT, turn_prompt)

        self.events.emit(
            EventType.LIVE_CONTROL_DECISION,
            question_id=cur.question.id,
            payload={
                "decision": decision.decision.value,
                "gap_type": decision.gap_type.value if decision.gap_type else None,
                "reasoning": decision.reasoning,
                "trigger": "utterance",
            },
        )

        if decision.decision == Decision.CODING_DONE:
            return await self._leave_coding("candidate_said_done")
        if decision.decision == Decision.GAP and decision.gap_type == GapType.CODING_HINT:
            return await self._give_coding_hint(decision.utterance, trigger="candidate_stuck")
        return None  # continue (или что-то неожиданное) — молчим, кандидат продолжает решать

    async def _give_coding_hint(self, utterance: str | None, trigger: str) -> str | None:
        """Общая точка выдачи подсказки во время решения — и по голосовому запросу
        (`_handle_coding_utterance`), и по обнаруженному затишью (`maybe_request_coding_hint`).
        Один общий счётчик `hints_used`, лимит `CODING_HINT_LIMIT` на вопрос."""
        cur = self.state.current
        assert cur is not None
        if cur.hints_used >= CODING_HINT_LIMIT:
            # Лимит подсказок исчерпан — молчим и ждём истечения времени на вопрос, не
            # долбим кандидата повторными просьбами/бездействием.
            return None
        cur.hints_used += 1
        phrase = utterance or "Подумайте над этим ещё немного — если не пойдёт, скажите, и я подскажу иначе."
        self.events.emit(
            EventType.CODING_HINT_GIVEN,
            question_id=cur.question.id,
            payload={"text": phrase, "trigger": trigger, "hints_remaining": CODING_HINT_LIMIT - cur.hints_used},
        )
        self._say(cur.question.id, "coding_hint", phrase)
        return phrase

    async def _leave_coding(self, reason: str) -> str | None:
        """Переход из Phase.CODING к фазе объяснения — по голосовому coding_done или по
        истечении времени (`force_finish_coding`). Дальше вопрос ведёт обычный реактивный
        цикл (on_candidate_final_turn), без отдельного тайм-бокса — только лимит
        `followups_used` (см. `_handle_gap`)."""
        cur = self.state.current
        if cur is None or self.state.phase != Phase.CODING:
            return None
        self.events.emit(
            EventType.CANDIDATE_CODE_SUBMITTED,
            question_id=cur.question.id,
            payload={"content": cur.code, "language": (cur.question.stimulus or {}).get("language"), "reason": reason},
        )
        self.state.phase = Phase.ASKING
        import random

        phrase = random.choice(EXPLAIN_SOLUTION_PHRASES)
        self._say(cur.question.id, "explain_prompt", phrase)
        return phrase

    async def _act_on_decision(self, decision) -> str | None:
        cur = self.state.current
        assert cur is not None

        if decision.decision == Decision.CONTINUE:
            # пауза — не конец мысли: ничего не говорим, остаёмся в LISTENING на этом же вопросе.
            return None

        if decision.decision == Decision.EXHAUSTIVE:
            return await self._advance_to_next_question(reason="exhaustive")

        if decision.decision == Decision.AMBIGUOUS:
            if cur.checkin_used:
                # раздел 2.3.1: не более одного чек-ина подряд — второй раз не спрашиваем,
                # просто считаем ответ завершённым, чтобы не зациклиться.
                return await self._advance_to_next_question(reason="checkin_exhausted")
            cur.checkin_used = True
            self.events.emit(EventType.CHECKIN_USED, question_id=cur.question.id)
            import random

            phrase = decision.utterance or random.choice(CHECKIN_PHRASES)
            self._say(cur.question.id, "checkin", phrase)
            return phrase

        if decision.decision == Decision.GAP:
            return await self._handle_gap(decision)

        raise AssertionError(f"неизвестное решение: {decision.decision}")

    async def _handle_gap(self, decision) -> str:
        cur = self.state.current
        assert cur is not None and decision.gap_type is not None

        if cur.question.format == "live_coding":
            # Фаза объяснения после решения (Phase.CODING сюда никогда не доходит — там
            # ведёт _handle_coding_utterance) — отдельный per-question лимит доп. вопросов,
            # не общий adaptive_budget_remaining/hint_used ниже (см. докстринг модуля).
            if cur.followups_used >= CODING_FOLLOWUP_LIMIT:
                return await self._advance_to_next_question(reason="coding_followup_budget_exhausted")
            cur.followups_used += 1
            utterance = decision.utterance or "Расскажете подробнее про это решение?"
            self.events.emit(
                EventType.ADAPTIVE_QUESTION_ASKED,
                question_id=cur.question.id,
                payload={
                    "gap_type": decision.gap_type.value,
                    "text": utterance,
                    "followups_remaining": CODING_FOLLOWUP_LIMIT - cur.followups_used,
                },
            )
            self._say(cur.question.id, GAP_TYPE_LABELS[decision.gap_type], utterance)
            return utterance

        if decision.gap_type == GapType.LEADING_HINT and cur.hint_used:
            # раздел 2.3.1: не более одной подсказки на вопрос — вторая попытка не даётся,
            # считаем ответ данным (со слабым сигналом, это увидит batch-контур по логу).
            return await self._advance_to_next_question(reason="hint_budget_exhausted")

        if self.state.adaptive_budget_remaining <= 0:
            # общий бюджет интервью исчерпан (раздел 2.3.1: 3-4 суммарно) — переходим дальше,
            # даже если формально есть ещё пробел; это компромисс длительности, не идёт молча.
            return await self._advance_to_next_question(reason="adaptive_budget_exhausted")

        if decision.gap_type == GapType.LEADING_HINT:
            cur.hint_used = True
        self.state.adaptive_budget_remaining -= 1

        utterance = decision.utterance or "Расскажете подробнее?"
        self.events.emit(
            EventType.ADAPTIVE_QUESTION_ASKED,
            question_id=cur.question.id,
            payload={
                "gap_type": decision.gap_type.value,
                "text": utterance,
                "budget_remaining_after": self.state.adaptive_budget_remaining,
            },
        )
        self._say(cur.question.id, GAP_TYPE_LABELS[decision.gap_type], utterance)
        return utterance

    async def _advance_to_next_question(self, reason: str) -> str:
        cur = self.state.current
        assert cur is not None
        if self.state.phase == Phase.CODING:
            # Кандидат пропустил вопрос («Дальше»/тайм-лимит), не дойдя до объяснения — код
            # не должен потеряться в протоколе, даже без озвученного решения.
            self.events.emit(
                EventType.CANDIDATE_CODE_SUBMITTED,
                question_id=cur.question.id,
                payload={
                    "content": cur.code,
                    "language": (cur.question.stimulus or {}).get("language"),
                    "reason": reason,
                },
            )
        self.events.emit(EventType.QUESTION_COMPLETED, question_id=cur.question.id, payload={"reason": reason})

        if self.state.is_last_question:
            self.state.phase = Phase.DONE
            self.events.emit(
                EventType.INTERVIEW_COMPLETED,
                payload={
                    "questions_asked": self.state.question_index + 1,
                    "adaptive_budget_used": 4 - self.state.adaptive_budget_remaining,
                },
            )
            return "Спасибо, это был последний вопрос! Ответы сейчас обрабатываются."

        import random

        transition = random.choice(EXHAUSTIVE_TRANSITION_PHRASES)
        self.state.question_index += 1
        next_question_intro = await self._enter_question()
        return f"{transition} {next_question_intro}"

    async def _enter_question(self) -> str:
        """Загружает СЛЕДУЮЩИЙ вопрос как единственный контекст (предыдущий отбрасывается —
        буквальная реализация требования "контекст только текущий вопрос") — включая LLM-
        сессию: `llm.reset()` пересоздаёт `ClaudeSDKClient` (см. llm_client.py), чтобы
        разговор с моделью не тянулся из прошлого вопроса."""
        await self.llm.reset()
        question = self.state.current_question
        self.state.current = QuestionRunState(question=question)
        # live_coding: сразу после вопроса — фаза решения задачи, не обычный диалог (см.
        # докстринг модуля и Phase.CODING).
        self.state.phase = Phase.CODING if question.format == "live_coding" else Phase.ASKING
        self.events.emit(
            EventType.QUESTION_STARTED,
            question_id=question.id,
            payload={
                "index": self.state.question_index,
                "questions_total": len(self.state.input.questions),
                "text": question.text,
                "skill_tag": question.skill_tag,
                "difficulty": question.difficulty.value,
                "role": question.role,
                "estimated_duration_sec": question.estimated_duration_sec,
            },
        )
        self._say(question.id, "question", question.text)
        return question.text

    def _say(self, question_id: str, kind: str, text: str) -> None:
        self.events.emit(EventType.AGENT_UTTERANCE, question_id=question_id, payload={"kind": kind, "text": text})
