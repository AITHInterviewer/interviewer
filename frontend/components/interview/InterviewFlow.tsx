"use client";

import { useEffect, useState } from "react";

import { DeviceCheck } from "@/components/interview/DeviceCheck";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type ConsentInfo = {
  interview_id: string;
  status: "created" | "in_progress" | "completed";
  vacancy_title: string;
  questions_total: number;
  estimated_duration_min: { min: number; max: number };
};

type FlowStep = "loading" | "not_found" | "already_completed" | "consent" | "device_check" | "ready";

/**
 * Оркестрирует US1 (specs/004-candidate-interview-flow/spec.md): согласие → проверка
 * устройств → готовность к интервью. Дальше (US2/US3 — сам interview-room) не входит в
 * этот компонент — на момент реализации US1 backend ещё не поднял control-канал/LiveKit
 * (см. tasks.md, Foundational, заблокировано на 003), поэтому шаг "ready" — конечная
 * точка этой итерации, не заглушка "на будущее без причины".
 */
export function InterviewFlow({ token }: { token: string }) {
  const [step, setStep] = useState<FlowStep>("loading");
  const [info, setInfo] = useState<ConsentInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ConsentInfo>(`/interview/${token}`)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setStep(data.status === "completed" ? "already_completed" : "consent");
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

  if (step === "consent") {
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
        <Button type="button" onClick={() => setStep("device_check")}>
          Начать
        </Button>
      </div>
    );
  }

  if (step === "device_check") {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h2 className="text-lg font-medium">Проверка камеры и микрофона</h2>
        <DeviceCheck onGranted={() => setStep("ready")} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-medium">Камера и микрофон готовы</h2>
      <p className="text-sm text-muted-foreground">
        Интервью начнётся здесь — см. specs/004-candidate-interview-flow, US2/US3 (control-канал на
        стороне backend ещё не подключён на момент этой итерации).
      </p>
    </div>
  );
}
