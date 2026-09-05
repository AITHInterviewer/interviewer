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

function accessTask(item: ManagerCandidate): string {
  return item.access === "handoff" ? "Передан вам, нужна встреча" : "Спросили мнение";
}

function formatWhen(value?: string | null): string {
  if (!value) {
    return "Не указана";
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

  async function refreshCandidates() {
    setPageLoading(true);
    setError(null);
    try {
      const response = await loadManagerCandidates();
      setItems(response.items);
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось загрузить встречи."));
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (!landing) {
      return;
    }
    // Первичная загрузка списка: состояние меняется уже после await,
    // но правило видит вызов из тела эффекта.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCandidates();
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
        <PageHeader path="Менеджер" title="Встречи и запросы мнения" />
        {pageLoading ? <SkeletonTable rows={3} columns={5} label="Загружаю кандидатов" /> : null}
        {error ? (
          <ScreenState
            kind="error"
            title="Нет списка"
            text={error}
            action={
              <Button type="button" variant="secondary" onClick={() => void refreshCandidates()}>
                Повторить
              </Button>
            }
          />
        ) : null}
        {!pageLoading && !error ? (
          items.length > 0 ? (
            <table className="vacancies-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Вакансия</th>
                  <th>Кто передал / запросил</th>
                  <th>Дата передачи / запроса</th>
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
                    <td>{accessTask(item)}</td>
                    <td>
                      <Button asChild variant="secondary">
                        <Link
                          href={`/manager/${item.interview.id}`}
                          aria-label={`Открыть ${item.interview.candidate_name ?? "Без имени"}`}
                        >
                          Открыть
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ScreenState
              kind="empty"
              title="Вам пока не передали кандидатов и не запросили мнение"
              text="Список появится после явной передачи или запроса мнения от рекрутера."
            />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
