"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/chrome/AppShell";
import { Stepper } from "@/components/chrome/Stepper";
import { clearDemoRole } from "@/lib/demo/session";

const STEPS = [
  "Приглашение",
  "Согласие",
  "Проверка",
  "Правила",
  "Тренировка",
  "Вопросы 1-5",
  "Готово",
] as const;

export type CandidateStep = (typeof STEPS)[number];

export function CandidateShell({
  children,
  step,
  vacancyTitle,
}: {
  children: ReactNode;
  step: CandidateStep;
  vacancyTitle?: string;
}) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <div className="candidate-shell">
      {offline ? (
        <p className="offline-banner" role="status">
          Нет соединения. Ответ сохраняется локально, продолжайте
        </p>
      ) : null}
      <div className="candidate-shell__body">
        <div className="candidate-company">
          <BrandMark />
          <span>{vacancyTitle ?? "Middle+ Python Developer"}</span>
        </div>
        <Stepper steps={[...STEPS]} current={step} />
        {children}
        <p className="candidate-help">
          Проблема? Напишите:{" "}
          <a href="mailto:help@napoleon-it.ru">help@napoleon-it.ru</a>
          {" · "}
          Telegram <a href="https://t.me/napoleon_help">@napoleon_help</a>
          {" · "}
          <Link className="candidate-help__role" href="/login" onClick={() => clearDemoRole()}>
            К выбору роли
          </Link>
        </p>
      </div>
    </div>
  );
}
