"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
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
                <div className="stack-list">
                  {queue.calibrations.map((vacancy) => (
                    <article className="candidate-card" key={vacancy.id}>
                      <div className="candidate-card__top">
                        <strong>{vacancy.title}</strong>
                        <span className="muted-copy">{vacancy.grade}</span>
                      </div>
                      <p className="muted-copy">
                        Требований: {(vacancy.requirements ?? []).filter((item) => item.checked).length}
                      </p>
                      <div className="form-actions">
                        <Button asChild>
                          <Link href={`/vacancies/${vacancy.id}/rubric`}>Проверить требования</Link>
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <ScreenState
                  kind="empty"
                  title="Комплекты на проверку не поступили"
                  text="Когда рекрутер отправит вакансию на калибровку, она появится здесь."
                />
              )}
            </section>
            <section className="plain-section">
              <h2>Отчёты на аудит</h2>
              {queue.audits.length > 0 ? (
                <div className="stack-list">
                  {queue.audits.map((item) => (
                    <article className="candidate-card" key={item.interview.id}>
                      <div className="candidate-card__top">
                        <strong>{item.interview.candidate_name ?? "Кандидат"}</strong>
                        <span className="muted-copy">{item.vacancy_title}</span>
                      </div>
                      <div className="form-actions">
                        <Button asChild variant="secondary">
                          <Link href={`/audit/${item.vacancy_id}/${item.interview.id}`}>
                            Открыть аудит
                          </Link>
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <ScreenState
                  kind="empty"
                  title="Запросов аудита нет"
                  text="Рекрутер попросит ваш взгляд — тогда отчёт появится в этом списке."
                />
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
