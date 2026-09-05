"use client";

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
  /** Степпер — только реальный роадмап вопросов, которым управляет агент во время
   * интервью (см. InterviewRoom.tsx, ControlEvent.type === "question"). Согласие и
   * проверка устройств в него не входят: до появления роадмапа `steps` пуст и хедер
   * рендерится без степпера вовсе. */
  steps?: string[];
  current?: string;
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
      <header className="candidate-shell__header">
        <div className="candidate-company">
          <BrandMark />
          <span>{vacancyTitle ?? "Интервью"}</span>
        </div>
        {steps && steps.length > 0 && current ? <Stepper steps={steps} current={current} /> : null}
      </header>
      <main className="candidate-shell__main">
        <div className="candidate-shell__body">{children}</div>
      </main>
    </div>
  );
}
