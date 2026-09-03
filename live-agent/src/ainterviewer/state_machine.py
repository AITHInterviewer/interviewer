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
    DONE            -> вопросы закончились

Между ASKING и LISTENING для одного вопроса цикл может провернуться много раз — это и есть
"реактивный цикл": после каждой паузы либо уходим в GAP/AMBIGUOUS (снова ASKING короткой
фразы, затем снова LISTENING), либо в EXHAUSTIVE (уходим со следующего вопроса).

Бюджеты (раздел 2.3.1): не более 1 чек-ина подряд на вопрос, не более 1 подсказки (leading_hint)
на вопрос, суммарный адаптивный бюджет на всё интервью — см. `InterviewState.adaptive_budget`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto

from .events import EventLog, EventType
from .llm_client import LiveControlLLM
from .prompts import (
    BACKCHANNEL_PHRASES,
    CHECKIN_PHRASES,
    EXHAUSTIVE_TRANSITION_PHRASES,
    GAP_TYPE_LABELS,
    SYSTEM_PROMPT,
    build_turn_prompt,
)
from .schema import Decision, GapType, InterviewInput, Question


class Phase(Enum):
    ASKING = auto()
    LISTENING = auto()
    DONE = auto()


@dataclass
class QuestionRunState:
    """Состояние, которое живёт ровно одно (текущее) прохождение вопроса и сбрасывается
    при переходе на следующий — буквально то, что значит "контекст = только текущий вопрос"."""

    question: Question
    dialogue: list[str] = field(default_factory=list)  # реплики кандидата ТОЛЬКО по этому вопросу
    checkin_used: bool = False
    hint_used: bool = False


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
        return self._enter_question()

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

        turn_prompt = build_turn_prompt(self.state.input.vacancy, cur.question, cur.dialogue)
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

    # -- внутренняя логика графа --------------------------------------------

    async def _act_on_decision(self, decision) -> str | None:
        cur = self.state.current
        assert cur is not None

        if decision.decision == Decision.CONTINUE:
            # пауза — не конец мысли: ничего не говорим, остаёмся в LISTENING на этом же вопросе.
            return None

        if decision.decision == Decision.EXHAUSTIVE:
            return self._advance_to_next_question(reason="exhaustive")

        if decision.decision == Decision.AMBIGUOUS:
            if cur.checkin_used:
                # раздел 2.3.1: не более одного чек-ина подряд — второй раз не спрашиваем,
                # просто считаем ответ завершённым, чтобы не зациклиться.
                return self._advance_to_next_question(reason="checkin_exhausted")
            cur.checkin_used = True
            self.events.emit(EventType.CHECKIN_USED, question_id=cur.question.id)
            import random

            phrase = decision.utterance or random.choice(CHECKIN_PHRASES)
            self._say(cur.question.id, "checkin", phrase)
            return phrase

        if decision.decision == Decision.GAP:
            return self._handle_gap(decision)

        raise AssertionError(f"неизвестное решение: {decision.decision}")

    def _handle_gap(self, decision) -> str:
        cur = self.state.current
        assert cur is not None and decision.gap_type is not None

        if decision.gap_type == GapType.LEADING_HINT and cur.hint_used:
            # раздел 2.3.1: не более одной подсказки на вопрос — вторая попытка не даётся,
            # считаем ответ данным (со слабым сигналом, это увидит batch-контур по логу).
            return self._advance_to_next_question(reason="hint_budget_exhausted")

        if self.state.adaptive_budget_remaining <= 0:
            # общий бюджет интервью исчерпан (раздел 2.3.1: 3-4 суммарно) — переходим дальше,
            # даже если формально есть ещё пробел; это компромисс длительности, не идёт молча.
            return self._advance_to_next_question(reason="adaptive_budget_exhausted")

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

    def _advance_to_next_question(self, reason: str) -> str:
        cur = self.state.current
        assert cur is not None
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
        next_question_intro = self._enter_question()
        return f"{transition} {next_question_intro}"

    def _enter_question(self) -> str:
        """Загружает СЛЕДУЮЩИЙ вопрос как единственный контекст (предыдущий отбрасывается —
        буквальная реализация требования "контекст только текущий вопрос")."""
        question = self.state.current_question
        self.state.current = QuestionRunState(question=question)
        self.state.phase = Phase.ASKING
        self.events.emit(
            EventType.QUESTION_STARTED,
            question_id=question.id,
            payload={
                "index": self.state.question_index,
                "text": question.text,
                "skill_tag": question.skill_tag,
                "difficulty": question.difficulty.value,
            },
        )
        self._say(question.id, "question", question.text)
        return question.text

    def _say(self, question_id: str, kind: str, text: str) -> None:
        self.events.emit(EventType.AGENT_UTTERANCE, question_id=question_id, payload={"kind": kind, "text": text})
