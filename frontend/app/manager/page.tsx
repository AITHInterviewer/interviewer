"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { ManagerCandidate } from "@/lib/api";
import { loadManagerCandidates } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const HIRING_MANAGER_AREA = "area.hiring_manager_review";

function accessLabel(access: ManagerCandidate["access"]): string {
  return access === "handoff" ? "Передан вам" : "Спросили мнение";
}

function actionLabel(item: ManagerCandidate): string {
  return item.access === "handoff" ? "Нужна встреча" : "Нужно мнение";
}

function formatWhen(value?: string | null): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export default function ManagerListPage() {
  const { landing, loading } = useProtectedLanding({ requiredArea: HIRING_MANAGER_AREA });
  const [items, setItems] = useState<ManagerCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;
    loadManagerCandidates()
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось загрузить встречи."));
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

  return (
    <AppShell nav={buildNav(landing)} title="Встречи">
      <div className="workspace">
        <PageHeader path="Менеджер" title="Кандидаты к встрече" />
        {pageLoading ? <SkeletonTable rows={3} columns={4} label="Загружаю кандидатов" /> : null}
        {error ? <ScreenState kind="error" title="Нет списка" text={error} /> : null}
        {!pageLoading && !error ? (
          items.length > 0 ? (
            <table className="vacancies-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Вакансия</th>
                  <th>Кто передал</th>
                  <th>Когда</th>
                  <th>Доступ</th>
                  <th>Что сделать</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.interview.id}>
                    <td>{item.interview.candidate_name ?? "Без имени"}</td>
                    <td>{item.vacancy_title}</td>
                    <td>{item.from_recruiter_name ?? "—"}</td>
                    <td>{formatWhen(item.handed_off_at)}</td>
                    <td>{accessLabel(item.access)}</td>
                    <td>{actionLabel(item)}</td>
                    <td>
                      <Button asChild variant="secondary">
                        <Link href={`/manager/${item.interview.id}`}>Открыть</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ScreenState
              kind="empty"
              title="Пока нет кандидатов"
              text="Список появится после явной передачи или запроса мнения от рекрутера."
            />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
