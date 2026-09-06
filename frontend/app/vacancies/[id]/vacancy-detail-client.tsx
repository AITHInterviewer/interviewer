"use client";

import { Check, Copy, FileText, List, Paperclip, SquaresFour, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { AssigneeField } from "@/components/chrome/AssigneeField";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SearchField, SelectField, Toolbar } from "@/components/chrome/Toolbar";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/shadcn/popover";
import { Modal, ModalActions } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Tag } from "@/components/ui/tag";
import { AvatarGroup, type AvatarPerson } from "@/components/ui/avatar";
import { CandidateCard } from "@/components/ui/candidate-card";
import { QuestionsPanel } from "@/components/vacancies/QuestionsPanel";
import { VacancyDescription } from "@/components/vacancies/VacancyDescription";
import type { AnonymizedStats, InternalUser, Interview, VacancyDetail } from "@/lib/api";
import {
  createManagedInterview,
  getSession,
  loadAnonymizedStats,
  loadInterviews,
  loadInternalUsers,
  loadVacancy,
  pauseManagedVacancy,
  resumeManagedVacancy,
  updateManagedVacancy,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, gradeLabel, vacancyBreadcrumbs, VACANCY_STATUS_LABEL } from "@/lib/nav";
import {
  formatRankingScore,
  groupInterviews,
  interviewColumn,
  interviewMark,
  rankingScore,
  sortByRanking,
  KANBAN_COLUMNS,
  type KanbanColumnId,
} from "@/lib/pipeline";
import { vacancyScoreRange } from "@/lib/report";

const RECRUITER_AREA = "area.recruiter_workspace";
const QUESTIONS_EDIT_ACTION = "action.questions.edit";
const LOCKED_STATUSES = new Set(["approved", "active", "paused", "archived", "ready"]);

/** Пустая колонка говорит, чего в ней ждать, а не молчит белым полем. */
const COLUMN_EMPTY: Record<KanbanColumnId, string> = {
  invited: "Никого ещё не приглашали",
  interviewed: "Никто ещё не закончил",
  evaluated: "Готовых отчётов нет",
  done: "Пока никого не закрыли",
};
const STAGE_EMPTY_NOW = "Сейчас в этой стадии никого нет";
const BOARD_VIEW_KEY = "recruiter-board-view";

function emptyColumnCopy(columnId: KanbanColumnId, totalInterviews: number): string {
  if (columnId === "invited" && totalInterviews > 0) {
    return STAGE_EMPTY_NOW;
  }
  return COLUMN_EMPTY[columnId];
}

function columnTitle(columnId: KanbanColumnId): string {
  return KANBAN_COLUMNS.find((column) => column.id === columnId)?.title ?? columnId;
}

const HIRING_MANAGER_AREA = "area.hiring_manager_review";

function statusTone(status: VacancyDetail["status"]): StatusTone {
  if (status === "active" || status === "ready" || status === "approved") return "positive";
  if (status === "calibration" || status === "pending_review" || status === "changes_requested") {
    return "warning";
  }
  return "neutral";
}

function inviteLink(accessToken: string): string {
  if (typeof window === "undefined") {
    return `/i/${accessToken}`;
  }
  return `${window.location.origin}/i/${accessToken}`;
}

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function VacancyDetailClient({ vacancyId }: { vacancyId: string }) {
  const { landing, loading } = useProtectedLanding();
  const currentUser = getSession()?.user;

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);
  const [vacancyError, setVacancyError] = useState<string | null>(null);

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);
  const [interviewsError, setInterviewsError] = useState<string | null>(null);

  const [stats, setStats] = useState<AnonymizedStats | null>(null);

  const [users, setUsers] = useState<InternalUser[]>([]);

  const [candidateName, setCandidateName] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [interviewFormError, setInterviewFormError] = useState<string | null>(null);
  const [interviewFormSubmitting, setInterviewFormSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [invitedCandidateName, setInvitedCandidateName] = useState("");
  const [inviteMessageCopied, setInviteMessageCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "questions" | null>(null);
  const [boardView, setBoardView] = useState<"kanban" | "list">("kanban");
  const [scoreSort, setScoreSort] = useState<"asc" | "desc">("desc");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateStageFilter, setCandidateStageFilter] = useState("all");

  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;
  const hasEditAction = landing?.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false;
  const isHiringManager = landing?.available_areas.some((area) => area.id === HIRING_MANAGER_AREA) ?? false;
  const showAnonymized = isHiringManager && !canManage;
  const vacancyUnlocked = vacancy ? !LOCKED_STATUSES.has(vacancy.status) : false;

  async function refreshVacancy() {
    setVacancyLoading(true);
    setVacancyError(null);
    try {
      const detail = await loadVacancy(vacancyId);
      setVacancy(detail);
    } catch (caughtError) {
      setVacancyError(normalizeError(caughtError, "Не удалось загрузить вакансию."));
    } finally {
      setVacancyLoading(false);
    }
  }

  async function refreshInterviews() {
    setInterviewsLoading(true);
    setInterviewsError(null);
    try {
      const response = await loadInterviews(vacancyId);
      setInterviews(response.items);
    } catch (caughtError) {
      setInterviewsError(normalizeError(caughtError, "Не удалось загрузить интервью."));
    } finally {
      setInterviewsLoading(false);
    }
  }

  async function refreshStats() {
    setInterviewsLoading(true);
    setInterviewsError(null);
    try {
      const next = await loadAnonymizedStats(vacancyId);
      setStats(next);
    } catch (caughtError) {
      setInterviewsError(normalizeError(caughtError, "Не удалось загрузить сводку."));
    } finally {
      setInterviewsLoading(false);
    }
  }

  useEffect(() => {
    if (!landing) {
      return;
    }
    // Первичная загрузка данных экрана: состояние меняется уже после await,
    // но правило видит вызов из тела эффекта. Каскадных перерисовок здесь нет.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshVacancy();
    if (showAnonymized) {
      void refreshStats();
    } else {
      void refreshInterviews();
    }
    if (canManage) {
      void loadInternalUsers()
        .then((response) => setUsers(response.items))
        .catch(() => setUsers([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing, vacancyId, showAnonymized, canManage]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BOARD_VIEW_KEY);
      if (stored === "kanban" || stored === "list") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBoardView(stored);
      }
    } catch {
      // localStorage может быть недоступен — остаёмся на канбане.
    }
  }, []);

  function handleBoardView(next: "kanban" | "list") {
    setBoardView(next);
    try {
      window.localStorage.setItem(BOARD_VIEW_KEY, next);
    } catch {
      // Вид всё равно меняется в этой сессии.
    }
  }

  const grouped = useMemo(() => groupInterviews(interviews), [interviews]);
  const filteredCandidates = useMemo(() => {
    const needle = candidateSearch.trim().toLowerCase();
    return interviews.filter((interview) => {
      const matchesStage =
        candidateStageFilter === "all" || interviewColumn(interview) === candidateStageFilter;
      const matchesSearch = (interview.candidate_name ?? "Без имени").toLowerCase().includes(needle);
      return matchesStage && matchesSearch;
    });
  }, [interviews, candidateSearch, candidateStageFilter]);
  const listedCandidates = useMemo(() => {
    const ranked = sortByRanking(filteredCandidates);
    if (scoreSort === "desc") return ranked;
    const scored = ranked.filter((item) => rankingScore(item) != null);
    const rest = ranked.filter((item) => rankingScore(item) == null);
    return [...scored.reverse(), ...rest];
  }, [filteredCandidates, scoreSort]);
  const canInvite = vacancy?.status === "active";
  const showPause = canManage && vacancy?.status === "active";
  const showResume = canManage && vacancy?.status === "paused";
  const canManageQuestions = canManage && vacancyUnlocked;
  const canEditQuestionContent = hasEditAction && vacancyUnlocked;
  // По умолчанию: активная вакансия открывается на дашборде кандидатов, вакансия
  // на проверке у эксперта — на вопросах. Once пользователь сам переключил вкладку,
  // его выбор не трогаем, даже если статус вакансии сменится.
  const defaultTab =
    vacancy?.status === "calibration" || vacancy?.status === "pending_review" ? "questions" : "dashboard";
  const effectiveTab = activeTab ?? defaultTab;

  const assignedPeople: AvatarPerson[] = vacancy
    ? [
        ...(users.find((user) => user.id === vacancy.recruiter_id)
          ? [{ name: users.find((user) => user.id === vacancy.recruiter_id)!.name, role: "Рекрутер" }]
          : []),
        ...(vacancy.expert_id
          ? [{ name: users.find((user) => user.id === vacancy.expert_id)?.name ?? "?", role: "Эксперт" }]
          : []),
        ...(vacancy.hiring_manager_id
          ? [
              {
                name: users.find((user) => user.id === vacancy.hiring_manager_id)?.name ?? "?",
                role: "Менеджер",
              },
            ]
          : []),
      ]
    : [];

  async function applyVacancyUpdate(run: () => Promise<{ status: VacancyDetail["status"] }>, fallback: string) {
    setActionBusy(true);
    setActionError(null);
    try {
      const updated = await run();
      setVacancy((current) => (current ? { ...current, ...updated } : current));
    } catch (caughtError) {
      setActionError(normalizeError(caughtError, fallback));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleAssigneeChange(field: "expertId" | "hiringManagerId", value: string | null) {
    setActionError(null);
    try {
      const updated = await updateManagedVacancy(vacancyId, { [field]: value });
      setVacancy((current) => (current ? { ...current, ...updated } : current));
    } catch (caughtError) {
      setActionError(normalizeError(caughtError, "Не удалось сохранить назначение."));
    }
  }

  async function handleCreateInterview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidateName.trim()) {
      setInterviewFormError("Укажите ФИО кандидата.");
      return;
    }
    if (!resumeFile) {
      setInterviewFormError("Приложите резюме: без него эксперт не поймёт контекст ответов.");
      return;
    }

    setInterviewFormSubmitting(true);
    setInterviewFormError(null);

    try {
      const response = await createManagedInterview(vacancyId, {
        resumeFile,
        candidateName,
      });
      setCreatedInviteLink(inviteLink(response.interview.access_token));
      setInvitedCandidateName(candidateName);
      setCandidateName("");
      setResumeFile(null);
      setInviteOpen(false);
      setLinkModalOpen(true);
      await refreshInterviews();
    } catch (caughtError) {
      setInterviewFormError(normalizeError(caughtError, "Не удалось создать приглашение."));
    } finally {
      setInterviewFormSubmitting(false);
    }
  }

  function handleOpenInvite() {
    setCreatedInviteLink(null);
    setInterviewFormError(null);
    setInviteOpen(true);
  }

  function buildInviteMessage(): string {
    if (!createdInviteLink) {
      return "";
    }
    const name = invitedCandidateName.trim();
    const greeting = name ? `Здравствуйте, ${name}!` : "Здравствуйте!";
    const position = vacancy ? ` на позицию «${vacancy.title}»` : "";
    return `${greeting} Приглашаем вас пройти асинхронное техническое интервью${position}. Перейдите по ссылке, чтобы начать: ${createdInviteLink}`;
  }

  async function handleCopyInviteMessage() {
    const message = buildInviteMessage();
    if (!message) return;
    try {
      await navigator.clipboard?.writeText(message);
      setInviteMessageCopied(true);
      setTimeout(() => setInviteMessageCopied(false), 1500);
    } catch {
      // Буфер обмена недоступен (например, нет разрешения) — сообщение всё равно
      // видно текстом, можно выделить и скопировать руками.
    }
  }

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  const nav = buildNav(landing);

  return (
    <AppShell nav={nav} title="Вакансия">
      <div className="workspace workspace--wide">
        {vacancyLoading ? <ScreenState kind="loading" title="Загрузка" text="Загружаем вакансию…" /> : null}
        {vacancyError ? (
          <ScreenState
            kind="error"
            title="Не удалось загрузить вакансию"
            text={vacancyError}
            action={
              <Button type="button" variant="secondary" onClick={() => void refreshVacancy()}>
                Повторить
              </Button>
            }
          />
        ) : null}

        {!vacancyLoading && vacancy ? (
          <>
            <nav className="path path--breadcrumbs" aria-label="Хлебные крошки">
              {vacancyBreadcrumbs(vacancyId, vacancy.title, "Доска").map((item, index) => (
                <span className="path__segment" key={`${item.label}-${index}`}>
                  {index > 0 ? (
                    <span className="path__sep" aria-hidden="true">
                      {" "}
                      /{" "}
                    </span>
                  ) : null}
                  {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
                </span>
              ))}
            </nav>

            <section className="vacancy-info-card">
              <div className="vacancy-info-card__main">
              <div className="vacancy-info-card__header">
                <h1>
                  {vacancy.title}
                  {vacancy.grade !== "unspecified" ? ` (${gradeLabel(vacancy.grade)})` : null}
                </h1>
                <StatusPill tone={statusTone(vacancy.status)}>
                  {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}
                </StatusPill>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="vacancy-assignees-trigger"
                      aria-label="Назначенные на вакансию"
                    >
                      {assignedPeople.length > 0 ? (
                        <AvatarGroup people={assignedPeople} />
                      ) : (
                        <span className="avatar avatar--placeholder">+</span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="vacancy-assignees-popover" align="start">
                    <PopoverTitle>Назначенные на вакансию</PopoverTitle>
                    <div className="vacancy-assignee-row">
                      <span className="vacancy-assignee__role">Рекрутер</span>
                      <span className="vacancy-assignee__name">
                        {users.find((user) => user.id === vacancy.recruiter_id)?.name ?? "—"}
                      </span>
                    </div>
                    {canManage ? (
                      <>
                        <AssigneeField
                          label="Эксперт"
                          roleCode="expert"
                          users={users}
                          value={vacancy.expert_id ?? null}
                          onChange={(value) => void handleAssigneeChange("expertId", value)}
                          currentUserId={currentUser?.id}
                        />
                        <AssigneeField
                          label="Менеджер"
                          roleCode="hiring_manager"
                          users={users}
                          value={vacancy.hiring_manager_id ?? null}
                          onChange={(value) => void handleAssigneeChange("hiringManagerId", value)}
                          currentUserId={currentUser?.id}
                        />
                      </>
                    ) : null}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="vacancy-info-card__meta">
                <span>Создана {formatCreatedAt(vacancy.created_at)}</span>
              </div>

              <div className="vacancy-info-card__body">
                <VacancyDescription title={vacancy.title} description={vacancy.description} />

                {vacancy.required_skills.length > 0 ? (
                  <div className="vacancy-info-card__skills">
                    {vacancy.required_skills.map((skill) => (
                      <Tag key={skill} label={skill} />
                    ))}
                  </div>
                ) : null}
              </div>
              {(() => {
                const scoreRange = vacancyScoreRange(vacancy, vacancy.questions.length);
                return (
                  <p className="vacancy-score-range">
                    Шкала интервью: {scoreRange.minimum}–{scoreRange.maximum} балла. Проходной порог: больше {scoreRange.threshold} ({"60%"}).
                  </p>
                );
              })()}
              </div>

              <div className="vacancy-info-card__invite">
                {showPause ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={actionBusy}
                    onClick={() =>
                      void applyVacancyUpdate(() => pauseManagedVacancy(vacancyId), "Не удалось поставить на паузу.")
                    }
                  >
                    {actionBusy ? "Приостанавливаем…" : "Приостановить"}
                  </Button>
                ) : null}
                {showResume ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={actionBusy}
                    onClick={() =>
                      void applyVacancyUpdate(() => resumeManagedVacancy(vacancyId), "Не удалось возобновить вакансию.")
                    }
                  >
                    {actionBusy ? "Возобновляем…" : "Возобновить"}
                  </Button>
                ) : null}
                {canManage ? (
                  <Button type="button" disabled={!canInvite} onClick={() => handleOpenInvite()}>
                    Пригласить кандидата
                  </Button>
                ) : null}
              </div>

              {actionError ? <p className="form-error">{actionError}</p> : null}
            </section>

            <div className="board-tabs">
              <div className="tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  data-active={effectiveTab === "questions" ? "true" : undefined}
                  onClick={() => setActiveTab("questions")}
                >
                  Вопросы
                </button>
                <button
                  type="button"
                  role="tab"
                  data-active={effectiveTab === "dashboard" ? "true" : undefined}
                  onClick={() => setActiveTab("dashboard")}
                >
                  Дашборд
                </button>
              </div>
              {effectiveTab === "dashboard" && vacancy.questions.length > 0 && !showAnonymized ? (
                <span className="density-switch">
                  <button
                    type="button"
                    title="Канбан"
                    aria-label="Канбан"
                    data-active={boardView === "kanban" ? "true" : undefined}
                    onClick={() => handleBoardView("kanban")}
                  >
                    <SquaresFour size={16} />
                  </button>
                  <button
                    type="button"
                    title="Список"
                    aria-label="Список"
                    data-active={boardView === "list" ? "true" : undefined}
                    onClick={() => handleBoardView("list")}
                  >
                    <List size={16} />
                  </button>
                </span>
              ) : null}
            </div>

            {effectiveTab === "questions" ? (
              <QuestionsPanel
                vacancyId={vacancyId}
                questions={vacancy.questions}
                canManage={canManageQuestions}
                canEditContent={canEditQuestionContent}
                onQuestionsChanged={refreshVacancy}
              />
            ) : vacancy.questions.length === 0 ? (
              <ScreenState
                kind="empty"
                title="Сначала соберите вопросы"
                text="Дашборд и список кандидатов появятся, как только у вакансии будет хотя бы один вопрос."
                action={
                  <Button type="button" variant="secondary" onClick={() => setActiveTab("questions")}>
                    К вопросам
                  </Button>
                }
              />
            ) : showAnonymized ? (
              <section className="plain-section">
                <h2>Сводка без имён</h2>
                {interviewsLoading ? <ScreenState kind="loading" title="Загрузка" text="Считаем статусы…" /> : null}
                {interviewsError ? (
                  <ScreenState
                    kind="error"
                    title="Нет сводки"
                    text={interviewsError}
                    action={
                      <Button type="button" variant="secondary" onClick={() => void refreshStats()}>
                        Повторить
                      </Button>
                    }
                  />
                ) : null}
                {stats ? (
                  <p>
                    Приглашены: {stats.invited}. Завершили: {stats.completed}. Ждут решения:{" "}
                    {stats.awaiting_decision}. Имена откроются после явной передачи от рекрутера.
                  </p>
                ) : null}
              </section>
            ) : (
              <>
                {interviewsLoading ? (
                  <ScreenState kind="loading" title="Загрузка" text="Загружаем кандидатов…" />
                ) : null}
                {interviewsError ? (
                  <ScreenState
                    kind="error"
                    title="Не удалось загрузить интервью"
                    text={interviewsError}
                    action={
                      <Button type="button" variant="secondary" onClick={() => void refreshInterviews()}>
                        Повторить
                      </Button>
                    }
                  />
                ) : null}

                {!interviewsLoading && !interviewsError && boardView === "list" ? (
                  <section className="candidates-table-section">
                    <Toolbar>
                      <SearchField
                        className="search-field--grow"
                        label="Поиск по имени кандидата"
                        placeholder="Поиск кандидата"
                        value={candidateSearch}
                        onChange={setCandidateSearch}
                      />
                      <SelectField
                        label="Стадия"
                        value={candidateStageFilter}
                        onChange={setCandidateStageFilter}
                        options={[
                          { value: "all", label: "Любая стадия" },
                          ...KANBAN_COLUMNS.map((column) => ({ value: column.id, label: column.title })),
                        ]}
                      />
                    </Toolbar>
                    {listedCandidates.length === 0 ? (
                      <ScreenState
                        kind="empty"
                        title="Никого не нашли"
                        text="Снимите фильтры или измените поиск."
                      />
                    ) : (
                      <table className="vacancies-table">
                        <thead>
                          <tr>
                            <th>Имя</th>
                            <th>Стадия</th>
                            <th>Метка</th>
                            <th>
                              <button
                                type="button"
                                onClick={() => setScoreSort((current) => (current === "desc" ? "asc" : "desc"))}
                              >
                                Балл {scoreSort === "desc" ? "↓" : "↑"}
                              </button>
                            </th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {listedCandidates.map((interview) => {
                            const name = interview.candidate_name ?? "Без имени";
                            const mark = interviewMark(interview);
                            const score = rankingScore(interview);
                            const reportHref = `/vacancies/${vacancyId}/candidates/${interview.id}`;
                            return (
                              <tr key={interview.id}>
                                <td>
                                  <Link href={reportHref}>{name}</Link>
                                </td>
                                <td>{columnTitle(interviewColumn(interview))}</td>
                                <td>
                                  <StatusPill tone={mark.tone}>{mark.label}</StatusPill>
                                </td>
                                <td>{score != null ? `${formatRankingScore(score)}%` : "—"}</td>
                                <td>
                                  <Link href={reportHref} aria-label={`Открыть отчёт: ${name}`}>
                                    <FileText size={16} />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </section>
                ) : null}

                {!interviewsLoading && !interviewsError && boardView === "kanban" ? (
                  <>
                    <section className="kanban" aria-label="Кандидаты по этапам">
                      {KANBAN_COLUMNS.map((column) => {
                        const items = grouped[column.id];
                        return (
                          <div className="kanban-column" key={column.id}>
                            <div className="kanban-column__header">
                              <h2>{column.title}</h2>
                              <span>{items.length}</span>
                            </div>
                            <div className="candidate-stack">
                              {items.length === 0 ? (
                                <p className="kanban-column__empty">
                                  {emptyColumnCopy(column.id, interviews.length)}
                                </p>
                              ) : (
                                items.map((interview) => {
                                  const name = interview.candidate_name ?? "Без имени";
                                  const mark = interviewMark(interview);
                                  return (
                                    <CandidateCard
                                      key={interview.id}
                                      name={name}
                                      mark={<StatusPill tone={mark.tone}>{mark.label}</StatusPill>}
                                      score={rankingScore(interview)}
                                      href={`/vacancies/${vacancyId}/candidates/${interview.id}`}
                                      action={`Открыть отчёт: ${name}`}
                                    />
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  </>
                ) : null}
              </>
            )}

            {canManage ? (
              <Modal open={inviteOpen} title="Пригласить кандидата" onClose={() => setInviteOpen(false)}>
                <form className="form-surface" onSubmit={handleCreateInterview}>
                  <label>
                    ФИО кандидата
                    <input
                      value={candidateName}
                      onChange={(event) => setCandidateName(event.target.value)}
                      disabled={!canInvite}
                      required
                    />
                  </label>
                  <div className="attachment-field">
                    <span className="attachment-field__label">Резюме кандидата</span>
                    <span className="attachment-field__row">
                      <label className="attachment-field__button" data-disabled={!canInvite || undefined}>
                        <Paperclip size={16} />
                        {resumeFile ? "Заменить файл" : "Прикрепить файл"}
                        <input
                          type="file"
                          aria-label="Резюме кандидата"
                          onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                          disabled={!canInvite}
                        />
                      </label>
                      {resumeFile ? (
                        <span className="attachment-field__name">
                          {resumeFile.name}
                          <button
                            type="button"
                            aria-label="Убрать файл"
                            onClick={() => setResumeFile(null)}
                            disabled={!canInvite}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {interviewFormError ? <p className="form-error">{interviewFormError}</p> : null}
                  <ModalActions>
                    <Button type="button" variant="secondary" data-modal-initial-focus onClick={() => setInviteOpen(false)}>
                      Отмена
                    </Button>
                    <Button
                      type="submit"
                      disabled={!canInvite}
                      loading={interviewFormSubmitting}
                      loadingLabel="Приглашаем…"
                    >
                      Пригласить
                    </Button>
                  </ModalActions>
                </form>
              </Modal>
            ) : null}

            {canManage ? (
              <Modal
                open={linkModalOpen}
                title="Кандидат приглашён"
                onClose={() => setLinkModalOpen(false)}
              >
                <div className="form-surface">
                  {createdInviteLink ? (
                    <div className="invite-message" aria-label="Сообщение для кандидата">
                      <button
                        type="button"
                        className="invite-message__copy"
                        aria-label="Скопировать сообщение"
                        onClick={() => void handleCopyInviteMessage()}
                      >
                        {inviteMessageCopied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <pre>{buildInviteMessage()}</pre>
                    </div>
                  ) : null}
                </div>
              </Modal>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
