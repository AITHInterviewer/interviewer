"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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

function auditRowContext(item: ExpertQueueResponse["audits"][number]): string {
  const requirement = item.requirement?.trim();
  const reason = item.reason?.trim();
  if (requirement && reason) {
    return `Требование: ${requirement}. ${reason}`;
  }
  if (requirement) {
    return `Требование: ${requirement}. Причина запроса в очереди не пришла — откройте карточку.`;
  }
  if (reason) {
    return `${reason} Конкретное требование в очереди не указано — откройте карточку.`;
  }
  return "Требование и причина запроса в очереди не пришли. Откройте карточку: там отчёт целиком.";
}

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

  return (
    <AppShell nav={buildNav(landing)} title="Аудит">
      <div className="workspace">
        <PageHeader path="Эксперт / Аудит" title="Кандидаты на аудит" />
        {pageLoading ? <ScreenState kind="loading" title="Загрузка" text="Загружаем аудиты…" /> : null}
        {error ? <ScreenState kind="error" title="Нет списка" text={error} /> : null}
        {!pageLoading && !error ? (
          items.length > 0 ? (
            <ul className="stack-list">
              {items.map((item) => (
                <li key={item.interview.id}>
                  <Link href={`/audit/${params.vacancyId}/${item.interview.id}`}>
                    {item.interview.candidate_name ?? "Кандидат без имени"}
                  </Link>
                  <p>{auditRowContext(item)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <ScreenState kind="empty" title="Нет аудитов" text="По этой вакансии открытых аудитов нет." />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
