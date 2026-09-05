"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import type { Vacancy } from "@/lib/api";
import { loadVacancies } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, OWNER_LABEL, VACANCY_STATUS_LABEL } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";
const QUESTIONS_EDIT_ACTION = "action.questions.edit";

function statusTone(status: Vacancy["status"]): "positive" | "warning" | undefined {
  if (status === "active" || status === "ready") return "positive";
  if (status === "calibration" || status === "pending_review" || status === "changes_requested") {
    return "warning";
  }
  return undefined;
}

function ownerLabel(vacancy: Vacancy): string {
  const owner = vacancy.owner_next ?? (vacancy.status === "calibration" || vacancy.status === "pending_review" ? "expert" : "recruiter");
  return OWNER_LABEL[owner];
}

export default function VacanciesPage() {
  const { landing, loading } = useProtectedLanding();

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;
  const canReview = landing?.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false;
  const canAccess = canManage || canReview;

  useEffect(() => {
    if (!canAccess) {
      return;
    }

    let cancelled = false;
    setVacanciesLoading(true);

    loadVacancies()
      .then((response) => {
        if (!cancelled) {
          setVacancies(response.items);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось загрузить вакансии."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVacanciesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canAccess]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  const nav = buildNav(landing);

  if (!canAccess) {
    return (
      <AppShell nav={nav} title="Вакансии">
        <div className="workspace">
          <ScreenState
            kind="error"
            title="Доступа к вакансиям нет"
            text="Ваша роль не открывает вакансии. Если это ошибка, попросите администратора выдать доступ."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell nav={nav} title="Вакансии">
      <div className="workspace">
        <PageHeader
          path="Рекрутер"
          title="Вакансии"
          actions={
            canManage ? (
              <Button asChild>
                <Link href="/vacancies/new">Новая вакансия</Link>
              </Button>
            ) : null
          }
        />

        {vacanciesLoading ? <ScreenState kind="loading" title="Загрузка" text="Загружаем вакансии…" /> : null}
        {error ? <ScreenState kind="error" title="Не удалось загрузить вакансии" text={error} /> : null}

        {!vacanciesLoading && !error ? (
          vacancies.length > 0 ? (
            <table className="vacancies-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Статус</th>
                  <th>Следующий шаг</th>
                  <th>Кандидаты</th>
                </tr>
              </thead>
              <tbody>
                {vacancies.map((vacancy) => (
                  <tr key={vacancy.id}>
                    <td>
                      <Link href={`/vacancies/${vacancy.id}`}>{vacancy.title}</Link>
                    </td>
                    <td>
                      <span className="status" data-tone={statusTone(vacancy.status)}>
                        {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}
                      </span>
                    </td>
                    <td>{ownerLabel(vacancy)}</td>
                    <td>{vacancy.candidate_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ScreenState
              kind="empty"
              title="Вакансий пока нет"
              text="Заведите вакансию: эксперт соберёт рубрику, после этого можно приглашать кандидатов."
            />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
