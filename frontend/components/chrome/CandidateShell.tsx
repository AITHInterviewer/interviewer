"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/chrome/AppShell";
import { Stepper } from "@/components/chrome/Stepper";

export function CandidateShell({
  children,
  steps,
  current,
  vacancyTitle,
}: {
  children: ReactNode;
  /** Шаги реального флоу — не фиксированный сценарий фрагментированного роутинга
   * (см. specs/004-candidate-interview-flow): вызывающая сторона решает, что показать
   * (например, деградирует до "Настройка"/"Интервью", пока роадмап вопросов ещё
   * неизвестен, и переключается на реальные "Вопрос N" once известен total/index). */
  steps: string[];
  current: string;
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
          <span>{vacancyTitle ?? "Интервью"}</span>
        </div>
        <Stepper steps={steps} current={current} />
        {children}
        <p className="candidate-help">
          Проблема? Напишите:{" "}
          <a href="mailto:help@napoleon-it.ru">help@napoleon-it.ru</a>
          {" · "}
          Telegram <a href="https://t.me/napoleon_help">@napoleon_help</a>
          {" · "}
          <Link className="candidate-help__role" href="/login">
            К выбору роли
          </Link>
        </p>
      </div>
    </div>
  );
}
