"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import type { ExpertQueueResponse } from "@/lib/api";
import { loadExpertQueue } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, expertAuditBreadcrumbs } from "@/lib/nav";
import { auditRowContext } from "@/lib/audit";

const EXPERT_AREA = "area.expert_questions";

export { auditRowContext };

export default function AuditVacancyPage() {
  const params = useParams<{ vacancyId: string }>();
  const { landing, loading } = useProtectedLanding({ requiredArea: EXPERT_AREA });
  const [queue, setQueue] = useState<ExpertQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

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
          setError(normalizeError(caughtError, "Не удалось загрузить очередь аудита."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPageLoading(false);
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

  const items = (queue?.audits ?? []).filter((item) => item.vacancy_id === params.vacancyId);
  const vacancyTitle = items[0]?.vacancy_title ?? "Вакансия";

  return (
    <AppShell nav={buildNav(landing)} title="Аудит">
      <div className="workspace">
        <PageHeader
          breadcrumbs={expertAuditBreadcrumbs({ vacancyId: params.vacancyId, vacancyTitle })}
          title={`Аудиты · ${vacancyTitle}`}
        />
        {pageLoading ? <ScreenState kind="loading" title="Загрузка" text="Загружаем аудиты…" /> : null}
        {error ? <ScreenState kind="error" title="Нет списка" text={error} /> : null}
        {!pageLoading && !error ? (
          items.length > 0 ? (
            <div className="stack-list">
              {items.map((item) => (
                <article className="candidate-card" key={item.interview.id}>
                  <div className="candidate-card__top">
                    <strong>{item.interview.candidate_name ?? "Кандидат без имени"}</strong>
                  </div>
                  <p className="muted-copy">{auditRowContext(item)}</p>
                  <div className="form-actions">
                    <Button asChild variant="secondary">
                      <Link href={`/audit/${params.vacancyId}/${item.interview.id}`}>Открыть аудит</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <ScreenState kind="empty" title="Нет аудитов" text="По этой вакансии открытых аудитов нет." />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
