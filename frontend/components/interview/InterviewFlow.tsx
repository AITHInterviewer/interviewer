"use client";

import { useEffect, useState } from "react";

import { Check, Clock } from "@phosphor-icons/react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { DeviceCheck } from "@/components/interview/DeviceCheck";
import { InterviewRoom } from "@/components/interview/InterviewRoom";
import { Button } from "@/components/ui/button";
import { apiFetch, postCandidateConsent } from "@/lib/api";
import { markForwardProgress } from "@/lib/candidate-flow";

type ConsentInfo = {
  interview_id: string;
  status: "created" | "in_progress" | "completed";
  vacancy_title: string;
  questions_total: number;
  estimated_duration_min: { min: number; max: number };
  consented?: boolean;
};

type FlowStep = "loading" | "not_found" | "already_completed" | "consent" | "setup" | "ready";

/**
 * Оркестрирует US1 (specs/004-candidate-interview-flow/spec.md) в три экрана: явное
 * согласие на запись/обработку персональных данных ("consent"), проверка микрофона и
 * опциональной камеры ("setup"), сам interview-room ("ready"). Микрофон обязателен,
 * камера — по желанию; если согласие уже отмечено раньше — первый экран пропускается.
 */
export function InterviewFlow({ token }: { token: string }) {
  const [step, setStep] = useState<FlowStep>("loading");
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [speakerId, setSpeakerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ConsentInfo>(`/api/interview/${token}`)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setStep(data.status === "completed" ? "already_completed" : data.consented ? "setup" : "consent");
      })
      .catch(() => {
        if (!cancelled) setStep("not_found");
      });
    // Лучшее усилие: страница открыта — отмечаем это для рекрутёрского дашборда,
    // но не блокируем кандидата, если запрос не прошёл (см. markForwardProgress).
    void markForwardProgress(token, "opened").catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (step === "loading") {
    return (
      <main className="workspace workspace--center">
        <ScreenState kind="loading" title="Загружаем интервью…" text="Это займёт пару секунд." />
      </main>
    );
  }

  if (step === "not_found") {
    return (
      <main className="workspace workspace--center">
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
      <main className="workspace workspace--center">
        <ScreenState
          kind="empty"
          title="Это интервью уже пройдено"
          text="Повторное прохождение по этой ссылке недоступно."
        />
      </main>
    );
  }

  if (!info) return null;

  if (step === "consent") {
    const { min, max } = info.estimated_duration_min;
    return (
      <CandidateShell vacancyTitle={info.vacancy_title}>
        <ConsentStage
          vacancyTitle={info.vacancy_title}
          questionsTotal={info.questions_total}
          durationMin={min}
          durationMax={max}
          onAgree={() => {
            setStep("setup");
            void postCandidateConsent(token).catch(() => {});
          }}
        />
      </CandidateShell>
    );
  }

  if (step === "setup") {
    return (
      <CandidateShell vacancyTitle={info.vacancy_title}>
        <section className="setup-stage">
          <h1>Проверьте микрофон</h1>
          <p>Для голосовых ответов нужен микрофон. Камера не обязательна — интервью можно пройти без неё.</p>
          <DeviceCheck
            onGranted={(granted, speaker) => {
              setStream(granted);
              setSpeakerId(speaker);
              setStep("ready");
              void markForwardProgress(token, "ready").catch(() => {});
            }}
          />
        </section>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell vacancyTitle={info.vacancy_title}>
      <InterviewRoom sessionId={token} stream={stream} initialSpeakerId={speakerId} />
    </CandidateShell>
  );
}

function ConsentStage({
  vacancyTitle,
  questionsTotal,
  durationMin,
  durationMax,
  onAgree,
}: {
  vacancyTitle: string;
  questionsTotal: number;
  durationMin: number;
  durationMax: number;
  onAgree: () => void;
}) {
  const [agreed, setAgreed] = useState(false);

  return (
    <section className="setup-stage">
      <h1>Вас пригласили на интервью</h1>
      <p>Вакансия: {vacancyTitle}.</p>
      <div className="interview-facts">
        <span>{questionsTotal} основных вопросов</span>
        <span>
          <Clock size={18} />
          примерно {durationMin}–{durationMax} минут
        </span>
      </div>
      <ul className="check-list">
        <li>
          <Check size={17} />
          <span>Видео, аудио и текстовые ответы записываются целиком.</span>
        </li>
        <li>
          <Check size={17} />
          <span>Ответы оцениваются алгоритмически — без анализа лица, эмоций или голоса.</span>
        </li>
        <li>
          <Check size={17} />
          <span>Результат увидит только рекрутёр, разместивший вакансию.</span>
        </li>
      </ul>
      <div className="setup-stage__footer">
        <label className="consent-row" style={{ padding: 0 }}>
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
          <span>Соглашаюсь на обработку персональных данных и на видео- и аудиозапись интервью</span>
        </label>
        <Button type="button" size="large" disabled={!agreed} onClick={onAgree}>
          Начать
        </Button>
      </div>
    </section>
  );
}
