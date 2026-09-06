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
import { getSession, loadVacancies } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, candidateCountLabel, gradeLabel, vacancyNextStep, VACANCY_STATUS_LABEL } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";
const QUESTIONS_EDIT_ACTION = "action.questions.edit";

function formatVacancyDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function statusTone(status: Vacancy["status"]): StatusTone {
  if (status === "active" || status === "ready" || status === "approved") return "positive";
  if (status === "calibration" || status === "pending_review" || status === "changes_requested") {
    return "warning";
  }
  return "neutral";
}

export default function VacanciesPage() {
  const { landing, loading } = useProtectedLanding();

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("candidates");
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);

  const currentUserId = getSession()?.user.id;

  function isAssignedToMe(vacancy: Vacancy): boolean {
    return (
      vacancy.recruiter_id === currentUserId ||
      vacancy.expert_id === currentUserId ||
      vacancy.hiring_manager_id === currentUserId
    );
  }

  const assignedToMeCount = useMemo(
    () => (currentUserId ? vacancies.filter(isAssignedToMe).length : 0),
    [currentUserId, vacancies],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = vacancies
      .filter((item) => (assignedToMeOnly ? isAssignedToMe(item) : true))
      .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
      .filter((item) => item.title.toLowerCase().includes(needle));
    if (sort === "title") return [...rows].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    if (sort === "status") return [...rows].sort((a, b) => a.status.localeCompare(b.status));
    return [...rows].sort((a, b) => (b.candidate_count ?? 0) - (a.candidate_count ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedToMeOnly, currentUserId, query, sort, statusFilter, vacancies]);

  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;
  const canReview = landing?.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false;
  const canAccess = canManage || canReview;

  async function refreshVacancies() {
    setVacanciesLoading(true);
    setError(null);
    try {
      const response = await loadVacancies();
      setVacancies(response.items);
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось загрузить вакансии."));
    } finally {
      setVacanciesLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccess) {
      return;
    }
    // Первичная загрузка списка: состояние меняется уже после await,
    // но правило видит вызов из тела эффекта.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshVacancies();
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
          <div className="vacancy-dashboard">
            <div className="stat-tile">
              <span className="stat-tile__value">{vacancies.length}</span>
              <span className="stat-tile__label">Всего вакансий</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">
                {vacancies.filter((v) => v.status === "active" || v.status === "ready").length}
              </span>
              <span className="stat-tile__label">Активных</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">
                {
                  vacancies.filter(
                    (v) => v.status === "calibration" || v.status === "pending_review",
                  ).length
                }
              </span>
              <span className="stat-tile__label">На проверке у эксперта</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">
                {vacancies.reduce((sum, v) => sum + (v.candidate_count ?? 0), 0)}
              </span>
              <span className="stat-tile__label">Кандидатов всего</span>
            </div>
            <button
              type="button"
              className="stat-tile stat-tile--filter"
              aria-pressed={assignedToMeOnly}
              onClick={() => setAssignedToMeOnly((current) => !current)}
            >
              <span className="stat-tile__value">{assignedToMeCount}</span>
              <span className="stat-tile__label">Назначено мне</span>
            </button>
          </div>
        ) : null}

        {!vacanciesLoading && !error && vacancies.length > 0 ? <hr className="section-divider" /> : null}

        {!vacanciesLoading && !error && vacancies.length > 0 ? (
          <Toolbar>
            <SearchField
              className="search-field--grow"
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
          </Toolbar>
        ) : null}

        {!vacanciesLoading && !error && vacancies.length > 0 ? (
          <p className="toolbar-meta">Найдено: {visible.length}</p>
        ) : null}

        {vacanciesLoading ? <SkeletonTable rows={3} columns={4} label="Загружаю вакансии" /> : null}
        {error ? (
          <ScreenState
            kind="error"
            title="Не удалось загрузить вакансии"
            text={error}
            action={
              <Button type="button" variant="secondary" onClick={() => void refreshVacancies()}>
                Повторить
              </Button>
            }
          />
        ) : null}

        {!vacanciesLoading && !error ? (
          visible.length > 0 ? (
            <div className="vacancy-card-grid">
              {visible.map((vacancy) => (
                <Link
                  key={vacancy.id}
                  href={`/vacancies/${vacancy.id}`}
                  className="vacancy-card"
                  aria-label={`Открыть ${vacancy.title}`}
                >
                  <div className="vacancy-card__header">
                    <span className="vacancy-card__title">
                      {vacancy.title}
                      {vacancy.grade !== "unspecified" ? ` (${gradeLabel(vacancy.grade)})` : null}
                    </span>
                    <StatusPill tone={statusTone(vacancy.status)}>
                      {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}
                    </StatusPill>
                  </div>
                  <p className="vacancy-card__next-step">{vacancyNextStep(vacancy)}</p>
                  <p className="vacancy-card__candidates">
                    {candidateCountLabel(vacancy.candidate_count)}
                  </p>
                  <p className="vacancy-card__created">Создана {formatVacancyDate(vacancy.created_at)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <ScreenState
              kind="empty"
              title={vacancies.length === 0 ? "Вакансий пока нет" : "По выбранным условиям вакансий нет"}
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
                      setAssignedToMeOnly(false);
                    }}
                  >
                    Сбросить фильтры
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
