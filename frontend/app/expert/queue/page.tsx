"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import type { ExpertQueueResponse } from "@/lib/api";
import { loadExpertQueue } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const EXPERT_AREA = "area.expert_questions";

export default function ExpertQueuePage() {
  const { landing, loading } = useProtectedLanding({ requiredArea: EXPERT_AREA });
  const [queue, setQueue] = useState<ExpertQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;
    loadExpertQueue()
      .then((payload) => {
        if (!cancelled) {
          setQueue(payload);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось загрузить аудиты."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setQueueLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [landing]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  const audits = queue?.audits ?? [];

  return (
    <AppShell nav={buildNav(landing)} title="Аудиты">
      <div className="workspace">
        <PageHeader path="Эксперт / Аудиты" title="Аудиты" />
        {queueLoading ? <ScreenState kind="loading" title="Загрузка" text="Загружаем аудиты…" /> : null}
        {error ? <ScreenState kind="error" title="Аудиты недоступны" text={error} /> : null}
        {!queueLoading && !error ? (
          audits.length > 0 ? (
            <ul className="stack-list">
              {audits.map((item) => (
                <li key={item.interview.id}>
                  <Link href={`/audit/${item.vacancy_id}/${item.interview.id}`}>
                    {item.interview.candidate_name ?? "Кандидат"} · {item.vacancy_title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ScreenState kind="empty" title="Нет аудитов" text="Рекрутер ещё не запросил экспертный аудит." />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
