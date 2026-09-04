"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, Microphone, Pause, Play } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { LaptopGate } from "@/components/chrome/LaptopGate";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { getQuestion } from "@/lib/demo/rubric";
import { readSession, updateSession } from "@/lib/demo/session";

type Phase = "preparing" | "recording" | "typing" | "saved";

export default function QuestionPage() {
  const params = useParams<{ token: string; n: string }>();
  const router = useRouter();
  const candidate = getCandidateByToken(params.token);
  const questionIndex = Number(params.n);
  const question = getQuestion(questionIndex);

  const [phase, setPhase] = useState<Phase>("preparing");
  const [prepLeft, setPrepLeft] = useState(120);
  const [seconds, setSeconds] = useState(0);
  const [mode, setMode] = useState<"voice" | "text">(() => {
    if (typeof window === "undefined" || !candidate || !question) return "voice";
    const session = readSession(candidate.token);
    if (session.textOnly || question.type === "code" || question.type === "sql") return "text";
    return "voice";
  });
  const [text, setText] = useState("");
  const [notes, setNotes] = useState(() => {
    if (typeof window === "undefined" || !candidate) return "";
    return readSession(candidate.token).notes[String(questionIndex)] ?? "";
  });
  const [rephrased, setRephrased] = useState(() => {
    if (typeof window === "undefined" || !candidate) return false;
    return readSession(candidate.token).rephrased.includes(questionIndex);
  });
  const [rewritesLeft, setRewritesLeft] = useState(1);
  const textOnly =
    typeof window !== "undefined" && candidate ? readSession(candidate.token).textOnly : false;
  const prepExpired = prepLeft <= 0;

  useEffect(() => {
    if (!candidate) return;
    updateSession(candidate.token, {
      currentQuestion: questionIndex,
      interrupted: true,
    });
  }, [candidate, questionIndex]);

  useEffect(() => {
    if (phase !== "preparing" || prepExpired) return undefined;
    const id = window.setTimeout(() => setPrepLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(id);
  }, [phase, prepLeft, prepExpired]);

  useEffect(() => {
    if (phase !== "recording") return undefined;
    const id = window.setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const displayText = useMemo(() => {
    if (!question) return "";
    return rephrased ? question.altText : question.text;
  }, [question, rephrased]);

  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Ссылка не найдена"
          text="Такого приглашения в демо нет. Вернитесь ко входу и выберите роль кандидата."
          action={
            <Button asChild variant="secondary">
              <Link href="/login">К выбору роли</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (!question || Number.isNaN(questionIndex)) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Вопрос не найден"
          text="Такого шага в демо нет. Вернитесь к приглашению или ко входу."
          action={
            <Button asChild variant="secondary">
              <Link href={`/i/${candidate.token}`}>К приглашению</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const remainingMin = Math.max(5, (5 - questionIndex + 1) * 4);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const prepLabel = `${Math.floor(prepLeft / 60)}:${String(prepLeft % 60).padStart(2, "0")}`;

  function saveAnswer(answerMode: "voice" | "text", answerText: string) {
    const session = readSession(candidate!.token);
    updateSession(candidate!.token, {
      answers: {
        ...session.answers,
        [String(questionIndex)]: { mode: answerMode, text: answerText, saved: true },
      },
      notes: { ...session.notes, [String(questionIndex)]: notes },
      interrupted: true,
    });
    setPhase("saved");
    if (questionIndex === 3) {
      window.setTimeout(() => {
        router.push(`/i/${candidate!.token}/q/3/follow-up`);
      }, 1800);
    }
  }

  function goNext() {
    if (questionIndex >= 5) {
      updateSession(candidate!.token, { submitted: true, interrupted: false });
      router.push(`/i/${candidate!.token}/done`);
      return;
    }
    router.push(`/i/${candidate!.token}/q/${questionIndex + 1}`);
  }

  return (
    <LaptopGate>
      <CandidateShell step="Вопросы 1-5">
        <header className="question-progress">
          <span>
            Вопрос {questionIndex} из 5
          </span>
          <div className="progress-dots" aria-label={`Вопрос ${questionIndex} из пяти`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <i key={i} data-current={i === questionIndex} style={i < questionIndex ? { background: "var(--positive)" } : undefined} />
            ))}
          </div>
          <span>Осталось примерно {remainingMin} минут</span>
        </header>
        <section className="question-copy">
          <h1>{displayText}</h1>
          {question.structureHint ? (
            <p>
              <strong>Что раскрыть:</strong> {question.structureHint}
            </p>
          ) : null}
          <div className="question-tools">
            <button
              className="text-button"
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && "speechSynthesis" in window) {
                  const utter = new SpeechSynthesisUtterance(displayText);
                  utter.lang = "ru-RU";
                  window.speechSynthesis.speak(utter);
                }
              }}
            >
              <Play size={15} />
              Прослушать
            </button>
            <button
              className="text-button"
              type="button"
              disabled={rephrased}
              onClick={() => {
                setRephrased(true);
                const session = readSession(candidate.token);
                updateSession(candidate.token, {
                  rephrased: [...new Set([...session.rephrased, questionIndex])],
                });
              }}
            >
              Переформулировать
            </button>
          </div>
        </section>
        <section className="answer-workspace">
          <div className="think-panel">
            <div className="think-panel__top">
              <span>
                Время подумать <small>не оценивается</small>
              </span>
              <strong>
                {prepExpired ? "0:00" : prepLabel} / 2:00
              </strong>
            </div>
            <div className="time-track">
              <i style={{ width: `${Math.max(0, (prepLeft / 120) * 100)}%` }} />
            </div>
            {prepExpired ? (
              <p style={{ marginBottom: 16, color: "var(--warning)", fontSize: 13 }}>
                Время подготовки вышло. Начинайте, когда готовы.
              </p>
            ) : null}
            <label>
              Ваши заметки <small>видите только вы</small>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className="answer-controls">
            {question.type !== "code" && question.type !== "sql" ? (
              <div className="answer-mode">
                <button type="button" data-active={mode === "voice"} onClick={() => setMode("voice")} disabled={textOnly}>
                  <Microphone size={17} />
                  Голосом
                </button>
                <button type="button" data-active={mode === "text"} onClick={() => setMode("text")}>
                  Текстом
                </button>
              </div>
            ) : null}

            {phase === "preparing" && mode === "voice" && !textOnly ? (
              <div className="record-control">
                <button className="record-button" type="button" onClick={() => setPhase("recording")}>
                  <Microphone size={25} weight="fill" />
                </button>
                <strong>Начать ответ голосом</strong>
                <span>До 4 минут, доступна одна перезапись</span>
                <button className="text-button" type="button" onClick={() => setPhase("typing")}>
                  Ответить текстом
                </button>
              </div>
            ) : null}

            {phase === "preparing" && (mode === "text" || textOnly || question.type === "sql" || question.type === "code") ? (
              <div className="record-control">
                <Button type="button" onClick={() => setPhase("typing")}>
                  Ответить текстом
                </Button>
                {!textOnly && question.type === "open" ? (
                  <button className="text-button" type="button" onClick={() => setPhase("recording")}>
                    Начать ответ голосом
                  </button>
                ) : null}
              </div>
            ) : null}

            {phase === "recording" ? (
              <div className="record-control">
                <div className="record-live">
                  <i />
                  Запись · {time} / до 4:00
                </div>
                <div className="wave-bars wave-bars--live">
                  {[2, 6, 4, 8, 5, 3, 7, 4, 6, 2, 5, 8].map((height, index) => (
                    <i key={index} style={{ height: `${height * 5}px` }} />
                  ))}
                </div>
                <Button type="button" onClick={() => saveAnswer("voice", "demo voice answer")}>
                  <Pause size={18} weight="fill" />
                  Завершить ответ
                </Button>
                {rewritesLeft > 0 ? (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setRewritesLeft(0);
                      setSeconds(0);
                      setPhase("recording");
                    }}
                  >
                    Записать заново - осталась 1
                  </button>
                ) : null}
              </div>
            ) : null}

            {phase === "typing" ? (
              <div>
                <textarea
                  className="text-answer"
                  style={{ fontFamily: question.type === "sql" || question.type === "code" ? "var(--font-mono)" : undefined }}
                  placeholder="Введите ответ здесь"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <p style={{ color: "var(--ink-tertiary)", fontSize: 12, marginTop: 8 }}>
                  Слов: {text.trim() ? text.trim().split(/\s+/).length : 0}
                </p>
                <Button type="button" disabled={!text.trim()} onClick={() => saveAnswer("text", text)}>
                  Отправить ответ
                </Button>
                {!text.trim() ? <p className="disabled-hint">Сначала напишите ответ</p> : null}
              </div>
            ) : null}

            {phase === "saved" ? (
              <div className="record-control">
                <CheckCircle className="saved-icon" size={42} weight="fill" />
                <strong>Ответ сохранён</strong>
                {questionIndex === 3 ? (
                  <span>Проверяю ответ…</span>
                ) : (
                  <Button type="button" onClick={goNext}>
                    {questionIndex >= 5 ? "Перейти к завершению" : "Открыть следующий вопрос"}
                    <ArrowRight size={18} />
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </CandidateShell>
    </LaptopGate>
  );
}
