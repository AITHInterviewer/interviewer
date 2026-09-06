"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/chrome/AppShell";

export function CandidateShell({
  children,
  vacancyTitle,
}: {
  children: ReactNode;
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
      </header>
      <main className="candidate-shell__main">
        <div className="candidate-shell__body">{children}</div>
      </main>
    </div>
  );
}
