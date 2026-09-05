"use client";

import { useEffect, useState } from "react";

import { Check } from "@phosphor-icons/react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { DeviceCheck } from "@/components/interview/DeviceCheck";
import { InterviewRoom } from "@/components/interview/InterviewRoom";
import { apiFetch } from "@/lib/api";

type ConsentInfo = {
  interview_id: string;
  status: "created" | "in_progress" | "completed";
  vacancy_title: string;
  questions_total: number;
  estimated_duration_min: { min: number; max: number };
};

type FlowStep = "loading" | "not_found" | "already_completed" | "setup" | "ready";

/**
 * Оркестрирует US1 (specs/004-candidate-interview-flow/spec.md): согласие и проверка
 * устройств — один экран (`setup`), не два последовательных шага — камера/микрофон
 * запрашиваются только по явному клику внутри `DeviceCheck` (FR-001: до подтверждения
 * согласия — доступ не запрашивается), но кандидату не нужно отдельно "переходить"
 * между согласием и проверкой устройств. Дальше — сам interview-room ("ready").
 */
export function InterviewFlow({ token }: { token: string }) {
  const [step, setStep] = useState<FlowStep>("loading");
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  // Роадмап по оригинальным вопросам поднимается сюда из InterviewRoom (единственное
  // место, где он реально известен — см. InterviewRoom.tsx, ControlEvent.type ===
  // "question") — чтобы им управлял Stepper в CandidateShell.
  const [roadmap, setRoadmap] = useState<{ index: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ConsentInfo>(`/api/interview/${token}`)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setStep(data.status === "completed" ? "already_completed" : "setup");
      })
      .catch(() => {
        if (!cancelled) setStep("not_found");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (step === "loading") {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загружаем интервью…" text="Это займёт пару секунд." />
      </main>
    );
  }

  if (step === "not_found") {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Ссылка недействительна"
          text="Проверьте, что ссылка скопирована полностью."
        />
      </main>
    );
  }

  if (step === "already_completed") {
    return (
      <main className="workspace">
        <ScreenState
          kind="empty"
          title="Это интервью уже пройдено"
          text="Повторное прохождение по этой ссылке недоступно."
        />
      </main>
    );
  }

  if (!info) return null;

  // Пока роадмап ещё не известен (сетап или начало комнаты до первого вопроса) — простой
  // двухшаговый индикатор вместо статического списка шагов фиксированного сценария:
  // реальный флоу кандидата не фрагментирован на отдельные роуты (см. call-out 1 плана).
  const steps = roadmap
    ? Array.from({ length: roadmap.total }, (_, i) => `Вопрос ${i + 1}`)
    : ["Настройка", "Интервью"];
  const current = roadmap ? `Вопрос ${roadmap.index + 1}` : step === "setup" ? "Настройка" : "Интервью";

  if (step === "setup") {
    const { min, max } = info.estimated_duration_min;
    return (
      <CandidateShell vacancyTitle={info.vacancy_title} steps={steps} current={current}>
        <section className="setup-stage" style={{ width: "100%" }}>
          <h1>Перед началом интервью</h1>
          <ul className="check-list" style={{ marginTop: 0 }}>
            <li>
              <Check size={17} />
              <span>
                <strong>Запись.</strong> Видео и аудио звонка, а также текстовый ответ (если формат
                вопроса требует ввода), записываются целиком.
              </span>
            </li>
            <li>
              <Check size={17} />
              <span>
                <strong>Автоматизированная обработка.</strong> Ответы транскрибируются и оцениваются
                алгоритмически — без анализа лица, эмоций или голосовых характеристик.
              </span>
            </li>
            <li>
              <Check size={17} />
              <span>
                <strong>Кто увидит результат.</strong> Рекрутёр, разместивший вакансию.
              </span>
            </li>
            <li>
              <Check size={17} />
              <span>
                <strong>Вопросов:</strong> {info.questions_total}, ожидаемая длительность — {min}–{max}{" "}
                минут.
              </span>
            </li>
          </ul>
          <DeviceCheck
            onGranted={(granted, speaker) => {
              setStream(granted);
              setSpeakerId(speaker);
              setStep("ready");
            }}
          />
        </section>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell vacancyTitle={info.vacancy_title} steps={steps} current={current}>
      <InterviewRoom sessionId={token} stream={stream} initialSpeakerId={speakerId} onRoadmapChange={setRoadmap} />
    </CandidateShell>
  );
}
