"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/chrome/AppShell";
import { CandidatePrepProgress } from "@/components/chrome/CandidatePrepProgress";
import type { CandidateStep } from "@/lib/candidate-flow";

export function CandidateShell({
  children,
  vacancyTitle,
  prepStep,
}: {
  children: ReactNode;
  vacancyTitle?: string;
  /** Текущий шаг подготовки. На done/extra/expired/request не передаём. */
  prepStep?: CandidateStep;
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
      </header>
      <main className="candidate-shell__main">
        <div className="candidate-shell__body">
          {prepStep ? <CandidatePrepProgress current={prepStep} /> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
