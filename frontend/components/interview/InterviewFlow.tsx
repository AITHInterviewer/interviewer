"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    let cancelled = false;
    apiFetch<ConsentInfo>(`/interview/${token}`)
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
    return <p className="text-sm text-muted-foreground">Загружаем интервью…</p>;
  }

  if (step === "not_found") {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <h1 className="text-lg font-medium">Ссылка недействительна</h1>
        <p className="text-sm text-muted-foreground">Проверьте, что ссылка скопирована полностью.</p>
      </div>
    );
  }

  if (step === "already_completed") {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-lg font-medium">Это интервью уже пройдено</h1>
        <p className="text-sm text-muted-foreground">Повторное прохождение по этой ссылке недоступно.</p>
      </div>
    );
  }

  if (!info) return null;

  if (step === "setup") {
    const { min, max } = info.estimated_duration_min;
    return (
      <div className="space-y-6 rounded-xl border bg-card p-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">{info.vacancy_title}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Перед началом интервью</h1>
        </div>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Запись.</strong> Видео и аудио звонка, а также текстовый ответ
            (если формат вопроса требует ввода), записываются целиком.
          </li>
          <li>
            <strong className="text-foreground">Автоматизированная обработка.</strong> Ответы транскрибируются и
            оцениваются алгоритмически — без анализа лица, эмоций или голосовых характеристик.
          </li>
          <li>
            <strong className="text-foreground">Кто увидит результат.</strong> Рекрутёр, разместивший вакансию.
          </li>
          <li>
            <strong className="text-foreground">Вопросов:</strong> {info.questions_total}, ожидаемая длительность —{" "}
            {min}–{max} минут.
          </li>
        </ul>
        <DeviceCheck
          onGranted={(granted) => {
            setStream(granted);
            setStep("ready");
          }}
        />
      </div>
    );
  }

  return <InterviewRoom sessionId={token} stream={stream} />;
}
