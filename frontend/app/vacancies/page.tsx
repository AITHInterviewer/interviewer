"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { SearchField, SelectField, Toolbar } from "@/components/chrome/Toolbar";
import { SkeletonTable } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import type { Vacancy } from "@/lib/api";
import { loadVacancies } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, OWNER_LABEL, VACANCY_STATUS_LABEL } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";
const QUESTIONS_EDIT_ACTION = "action.questions.edit";

function statusTone(status: Vacancy["status"]): StatusTone {
  if (status === "active" || status === "ready" || status === "approved") return "positive";
  if (status === "calibration" || status === "pending_review" || status === "changes_requested") {
    return "warning";
  }
  return "neutral";
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("candidates");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = vacancies
      .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
      .filter((item) => item.title.toLowerCase().includes(needle));
    if (sort === "title") return [...rows].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    if (sort === "status") return [...rows].sort((a, b) => a.status.localeCompare(b.status));
    return [...rows].sort((a, b) => (b.candidate_count ?? 0) - (a.candidate_count ?? 0));
  }, [query, sort, statusFilter, vacancies]);

  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;
  const canReview = landing?.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false;
  const canAccess = canManage || canReview;

  useEffect(() => {
    if (!canAccess) {
      return;
    }

    let cancelled = false;

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

        {!vacanciesLoading && !error && vacancies.length > 0 ? (
          <Toolbar>
            <SearchField
              label="Поиск по названию"
              placeholder="Поиск вакансии"
              value={query}
              onChange={setQuery}
            />
            <SelectField
              label="Статус"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "Любой статус" },
                ...Array.from(new Set(vacancies.map((item) => item.status))).map((status) => ({
                  value: status,
                  label: VACANCY_STATUS_LABEL[status] ?? status,
                })),
              ]}
            />
            <SelectField
              label="Сортировка"
              value={sort}
              onChange={setSort}
              options={[
                { value: "candidates", label: "Сначала где больше кандидатов" },
                { value: "title", label: "По названию" },
                { value: "status", label: "По статусу" },
              ]}
            />
            <span className="toolbar__count">Найдено: {visible.length}</span>
          </Toolbar>
        ) : null}

        {vacanciesLoading ? <SkeletonTable rows={3} columns={4} label="Загружаю вакансии" /> : null}
        {error ? <ScreenState kind="error" title="Не удалось загрузить вакансии" text={error} /> : null}

        {!vacanciesLoading && !error ? (
          visible.length > 0 ? (
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
                {visible.map((vacancy) => (
                  <tr key={vacancy.id}>
                    <td>
                      <Link href={`/vacancies/${vacancy.id}`}>{vacancy.title}</Link>
                    </td>
                    <td>
                      <StatusPill tone={statusTone(vacancy.status)}>
                        {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}
                      </StatusPill>
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
              title={vacancies.length === 0 ? "Вакансий пока нет" : "Под фильтры ничего не подошло"}
              text={
                vacancies.length === 0
                  ? "Заведите вакансию: эксперт соберёт рубрику, после этого можно приглашать кандидатов."
                  : "Снимите фильтры или измените поиск — вакансии есть, но не под этот запрос."
              }
              action={
                vacancies.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setStatusFilter("all");
                    }}
                  >
                    Снять фильтры
                  </Button>
                ) : null
              }
            />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
