"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonList } from "@/components/ui/skeleton";
import type { ExpertQueueResponse } from "@/lib/api";
import { loadExpertQueue } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const EXPERT_AREA = "area.expert_questions";

export default function ExpertHomePage() {
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
          setError(normalizeError(caughtError, "Не удалось загрузить очередь."));
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

  return (
    <AppShell nav={buildNav(landing)} title="Эксперт">
      <div className="workspace">
        <PageHeader
          title="Что ждёт вас"
          description="Сверху вакансии, которым нужна рубрика и вопросы. Ниже отчёты, по которым рекрутер попросил ваш взгляд."
        />
        {queueLoading ? <SkeletonList count={2} label="Собираю очередь" /> : null}
        {error ? <ScreenState kind="error" title="Очередь недоступна" text={error} /> : null}
        {queue ? (
          <>
            <section className="plain-section">
              <h2>Вакансии на калибровке</h2>
              {queue.calibrations.length > 0 ? (
                <ul className="stack-list">
                  {queue.calibrations.map((vacancy) => (
                    <li key={vacancy.id}>
                      <Link href={`/vacancies/${vacancy.id}/rubric`}>{vacancy.title}</Link>
                      <span className="muted-copy"> · {vacancy.grade}, требований {vacancy.required_skills.length}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-copy">Новых вакансий на калибровку нет.</p>
              )}
            </section>
            <section className="plain-section">
              <h2>Отчёты на аудит</h2>
              {queue.audits.length > 0 ? (
                <ul className="stack-list">
                  {queue.audits.map((item) => (
                    <li key={item.interview.id}>
                      <Link href={`/audit/${item.vacancy_id}/${item.interview.id}`}>
                        {item.interview.candidate_name ?? "Кандидат"} · {item.vacancy_title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Запросов на аудит нет.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
