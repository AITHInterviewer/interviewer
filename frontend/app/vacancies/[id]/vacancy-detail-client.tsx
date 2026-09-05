"use client";

import { useEffect, useMemo, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Tag } from "@/components/ui/tag";
import { CandidateCard } from "@/components/ui/candidate-card";
import type { AnonymizedStats, Interview, VacancyDetail } from "@/lib/api";
import {
  activateManagedVacancy,
  createManagedInterview,
  generateVacancyQuestions,
  loadAnonymizedStats,
  loadInterviews,
  loadVacancy,
  pauseManagedVacancy,
  resumeManagedVacancy,
  sendManagedVacancyToExpert,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, VACANCY_STATUS_LABEL } from "@/lib/nav";
import { groupInterviews, interviewStageLabel, KANBAN_COLUMNS } from "@/lib/pipeline";

const RECRUITER_AREA = "area.recruiter_workspace";

/** Пустая колонка говорит, чего в ней ждать, а не молчит белым полем. */
const COLUMN_EMPTY: Record<string, string> = {
  invited: "Никого ещё не приглашали",
  live: "Сейчас никто не отвечает",
  action: "Ничего не ждёт вашего вмешательства",
  decide: "Готовых отчётов нет",
  done: "Решений пока не было",
};
const STAGE_EMPTY_NOW = "Сейчас в этой стадии никого нет";

function emptyColumnCopy(columnId: string, totalInterviews: number): string {
  if (columnId === "invited" && totalInterviews > 0) {
    return STAGE_EMPTY_NOW;
  }
  return COLUMN_EMPTY[columnId];
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

export function VacancyDetailClient({ vacancyId }: { vacancyId: string }) {
  const { landing, loading } = useProtectedLanding();

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);
  const [vacancyError, setVacancyError] = useState<string | null>(null);

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);
  const [interviewsError, setInterviewsError] = useState<string | null>(null);

  const [stats, setStats] = useState<AnonymizedStats | null>(null);

  const [candidateName, setCandidateName] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [interviewFormError, setInterviewFormError] = useState<string | null>(null);
  const [interviewFormSubmitting, setInterviewFormSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;
  const isHiringManager = landing?.available_areas.some((area) => area.id === HIRING_MANAGER_AREA) ?? false;
  const showAnonymized = isHiringManager && !canManage;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing, vacancyId, showAnonymized]);

  const grouped = useMemo(() => groupInterviews(interviews), [interviews]);
  const canInvite = vacancy?.status === "active";
  const showSend =
    canManage &&
    vacancy &&
    (vacancy.status === "extracted" || vacancy.status === "draft" || vacancy.status === "changes_requested");
  const showActivate = canManage && vacancy?.status === "approved";
  const showPause = canManage && vacancy?.status === "active";
  const showResume = canManage && vacancy?.status === "paused";
  const showGenerate =
    canManage &&
    vacancy &&
    vacancy.status !== "approved" &&
    vacancy.status !== "active" &&
    vacancy.status !== "paused" &&
    vacancy.status !== "archived" &&
    vacancy.status !== "ready";

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

  async function handleCreateInterview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeFile) {
      setInterviewFormError("Приложите резюме: без него эксперт не поймёт контекст ответов.");
      return;
    }

    setInterviewFormSubmitting(true);
    setInterviewFormError(null);

    try {
      const response = await createManagedInterview(vacancyId, {
        resumeFile,
        candidateName: candidateName || undefined,
      });
      setCreatedInviteLink(inviteLink(response.interview.access_token));
      setCopyError(null);
      setCopyDone(false);
      setCandidateName("");
      setResumeFile(null);
      await refreshInterviews();
    } catch (caughtError) {
      setInterviewFormError(normalizeError(caughtError, "Не удалось создать приглашение."));
    } finally {
      setInterviewFormSubmitting(false);
    }
  }

  async function handleCopyInviteLink() {
    if (!createdInviteLink) {
      return;
    }
    const writeText = navigator.clipboard?.writeText;
    if (!writeText) {
      setCopyDone(false);
      setCopyError("Не удалось скопировать. Выделите ссылку в поле и скопируйте вручную.");
      return;
    }
    try {
      await writeText.call(navigator.clipboard, createdInviteLink);
      setCopyError(null);
      setCopyDone(true);
    } catch {
      setCopyDone(false);
      setCopyError("Не удалось скопировать. Выделите ссылку в поле и скопируйте вручную.");
    }
  }

  async function handleGenerateQuestions() {
    setActionBusy(true);
    setActionError(null);
    try {
      const updated = await generateVacancyQuestions(vacancyId);
      setVacancy(updated);
    } catch (caughtError) {
      setActionError(normalizeError(caughtError, "Не удалось собрать вопросы."));
    } finally {
      setActionBusy(false);
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
            <PageHeader
              path="Вакансии"
              title={vacancy.title}
              description={
                <>
                  <p>{vacancy.description}</p>
                  {vacancy.required_skills.length > 0 ? (
                    <p className="table-tags">
                      {vacancy.required_skills.map((skill) => (
                        <Tag key={skill} label={skill} />
                      ))}
                    </p>
                  ) : null}
                </>
              }
              actions={
                <>
                  <StatusPill tone={statusTone(vacancy.status)}>
                    {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}
                  </StatusPill>
                  {canManage ? (
                    <span>
                      <Button type="button" disabled={!canInvite} onClick={() => setInviteOpen(true)}>
                        Пригласить кандидата
                      </Button>
                      {!canInvite ? (
                        <p className="disabled-hint">
                          Пригласить можно после того, как эксперт одобрит версию и вакансия станет активной.
                        </p>
                      ) : null}
                    </span>
                  ) : null}
                  {showGenerate ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={actionBusy}
                      onClick={() => void handleGenerateQuestions()}
                    >
                      Собрать вопросы
                    </Button>
                  ) : null}
                  {showSend ? (
                    <Button
                      type="button"
                      disabled={actionBusy}
                      onClick={() =>
                        void applyVacancyUpdate(
                          () => sendManagedVacancyToExpert(vacancyId),
                          "Не удалось отправить эксперту.",
                        )
                      }
                    >
                      {actionBusy ? "Отправляем…" : "Отправить эксперту"}
                    </Button>
                  ) : null}
                  {showActivate ? (
                    <Button
                      type="button"
                      disabled={actionBusy}
                      onClick={() =>
                        void applyVacancyUpdate(() => activateManagedVacancy(vacancyId), "Не удалось активировать вакансию.")
                      }
                    >
                      {actionBusy ? "Активируем…" : "Активировать вакансию"}
                    </Button>
                  ) : null}
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
                      disabled={actionBusy}
                      onClick={() =>
                        void applyVacancyUpdate(() => resumeManagedVacancy(vacancyId), "Не удалось возобновить вакансию.")
                      }
                    >
                      {actionBusy ? "Возобновляем…" : "Возобновить"}
                    </Button>
                  ) : null}
                </>
              }
            />
            {actionError ? <p className="form-error">{actionError}</p> : null}

            {showAnonymized ? (
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

                {!interviewsLoading && !interviewsError ? (
                  <>
                    {interviews.length === 0 ? (
                      <ScreenState
                        kind="empty"
                        title="Кандидатов пока нет"
                        text="После активации вакансии здесь появится доска кандидатов."
                      />
                    ) : null}
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
                                  return (
                                    <CandidateCard
                                      key={interview.id}
                                      name={name}
                                      stage={interviewStageLabel(interview)}
                                      href={`/vacancies/${vacancyId}/candidates/${interview.id}`}
                                      action={`Открыть ${name}`}
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

                {canManage ? (
                  <Modal
                    open={inviteOpen}
                    title="Пригласить кандидата"
                    onClose={() => setInviteOpen(false)}
                  >
                  <form className="form-surface" onSubmit={handleCreateInterview}>
                    <p className="muted-copy">
                      {createdInviteLink
                        ? "Ссылка создана. Отправьте её кандидату самостоятельно."
                        : "Система готовит ссылку. Письмо кандидату отправляете вы."}
                    </p>
                    <label>
                      Имя кандидата (необязательно)
                      <input
                        value={candidateName}
                        onChange={(event) => setCandidateName(event.target.value)}
                        disabled={!canInvite}
                      />
                    </label>
                    <label>
                      Резюме кандидата
                      <input
                        key={createdInviteLink ?? "resume-empty"}
                        type="file"
                        onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                        disabled={!canInvite}
                      />
                      <span className="field-hint">
                        Резюме увидят эксперт и нанимающий менеджер рядом с отчётом.
                      </span>
                    </label>
                    {createdInviteLink ? (
                      <label>
                        Ссылка для кандидата
                        <input readOnly value={createdInviteLink} />
                      </label>
                    ) : null}
                    {interviewFormError ? <p className="form-error">{interviewFormError}</p> : null}
                    <div className="form-actions">
                      <Button
                        type="submit"
                        disabled={!canInvite}
                        loading={interviewFormSubmitting}
                        loadingLabel="Готовлю ссылку…"
                      >
                        Подготовить ссылку
                      </Button>
                      {createdInviteLink ? (
                        <Button type="button" variant="secondary" onClick={() => void handleCopyInviteLink()}>
                          Скопировать ссылку
                        </Button>
                      ) : null}
                      <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
                        Отмена
                      </Button>
                    </div>
                    {copyError ? (
                      <p className="form-error" role="alert">
                        {copyError}
                      </p>
                    ) : null}
                    {copyDone ? (
                      <p role="status">Ссылка скопирована</p>
                    ) : null}
                  </form>
                  </Modal>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
