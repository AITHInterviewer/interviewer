"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import {
  QuestionEditForm,
  emptyQuestionForm,
  questionToForm,
  toQuestionInput,
  type QuestionFormState,
} from "@/components/vacancies/question-edit-form";
import type { Question, VacancyDetail, VacancyStatus } from "@/lib/api";
import {
  addManagedQuestion,
  approveManagedVacancy,
  deleteManagedQuestion,
  loadVacancy,
  updateManagedQuestion,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";
import {
  QUESTION_DIFFICULTY_LABEL,
  QUESTION_FORMAT_LABEL,
  QUESTION_ROLE_LABEL,
} from "@/lib/pipeline";

const QUESTIONS_EDIT_ACTION = "action.questions.edit";
const RECRUITER_AREA = "area.recruiter_workspace";
const APPROVABLE_STATUSES: VacancyStatus[] = ["calibration", "pending_review"];

export function VacancyQuestionsClient({ vacancyId }: { vacancyId: string }) {
  const { landing, loading } = useProtectedLanding();
  const searchParams = useSearchParams();
  const fromRecruiter = searchParams.get("from") === "recruiter";

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);
  const [vacancyError, setVacancyError] = useState<string | null>(null);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [questionActionError, setQuestionActionError] = useState<string | null>(null);
  const [questionActionSubmitting, setQuestionActionSubmitting] = useState(false);

  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveStatus, setApproveStatus] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const hasEditAction = landing?.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false;
  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;
  const canEditQuestions = hasEditAction && !fromRecruiter;
  const canApprove = vacancy ? APPROVABLE_STATUSES.includes(vacancy.status) : false;

  async function refreshVacancy() {
    try {
      setVacancyError(null);
      const detail = await loadVacancy(vacancyId);
      setVacancy(detail);
    } catch (caughtError) {
      setVacancyError(normalizeError(caughtError, "Не удалось открыть вакансию."));
    } finally {
      setVacancyLoading(false);
    }
  }

  useEffect(() => {
    if (!landing) {
      return;
    }
    void refreshVacancy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing, vacancyId]);

  async function handleAddQuestion(form: QuestionFormState) {
    if (!vacancy) {
      return;
    }
    setQuestionActionSubmitting(true);
    setQuestionActionError(null);

    try {
      const order = vacancy.questions.length;
      await addManagedQuestion(vacancy.id, toQuestionInput(form, order));
      setIsAddFormOpen(false);
      await refreshVacancy();
    } catch (caughtError) {
      setQuestionActionError(normalizeError(caughtError, "Не удалось добавить вопрос."));
    } finally {
      setQuestionActionSubmitting(false);
    }
  }

  async function handleUpdateQuestion(question: Question, form: QuestionFormState) {
    if (!vacancy) {
      return;
    }
    setQuestionActionSubmitting(true);
    setQuestionActionError(null);

    try {
      await updateManagedQuestion(vacancy.id, question.id, toQuestionInput(form, question.order));
      setEditingQuestionId(null);
      await refreshVacancy();
    } catch (caughtError) {
      setQuestionActionError(normalizeError(caughtError, "Не удалось сохранить вопрос."));
    } finally {
      setQuestionActionSubmitting(false);
    }
  }

  async function handleDeleteQuestion(question: Question) {
    if (!vacancy) {
      return;
    }
    setQuestionActionError(null);

    try {
      await deleteManagedQuestion(vacancy.id, question.id);
      await refreshVacancy();
    } catch (caughtError) {
      setQuestionActionError(normalizeError(caughtError, "Не удалось удалить вопрос."));
    }
  }

  async function handleApprove() {
    if (!vacancy) {
      return;
    }
    setApproving(true);
    setApproveError(null);
    setApproveStatus(null);

    try {
      await approveManagedVacancy(vacancy.id);
      setApproveStatus("Версия утверждена");
      await refreshVacancy();
    } catch (caughtError) {
      setApproveError(normalizeError(caughtError, "Не удалось утвердить версию."));
    } finally {
      setApproving(false);
    }
  }

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Проверяю доступ" text="Секунду, читаю вашу сессию." />
      </main>
    );
  }

  const nav = buildNav(landing);
  const querySuffix = fromRecruiter ? "?from=recruiter" : "";

  return (
    <AppShell nav={nav} title="Вопросы">
      <div className="workspace">
        {vacancyLoading ? <ScreenState kind="loading" title="Загружаю" text="Открываю вакансию." /> : null}
        {vacancyError ? <ScreenState kind="error" title="Вакансия не открылась" text={vacancyError} /> : null}

        {!vacancyLoading && vacancy ? (
          <>
            <PageHeader
              path={`Вакансии / ${vacancy.title}`}
              title="Вопросы"
              description={`Комплект из ${vacancy.questions.length} вопросов. Одинаковые основные вопросы для всех кандидатов.`}
            />
            {fromRecruiter ? null : <CalibrationSubnav vacancyId={vacancy.id} />}
            {questionActionError ? <p className="form-error">{questionActionError}</p> : null}

            {vacancy.questions.length > 0 ? (
              <div className="stack-list">
                {vacancy.questions.map((question) => (
                  <article className="candidate-card" key={question.id}>
                    {editingQuestionId === question.id ? (
                      <QuestionEditForm
                        initial={questionToForm(question)}
                        submitLabel="Сохранить вопрос"
                        submitting={questionActionSubmitting}
                        onSubmit={(form) => void handleUpdateQuestion(question, form)}
                      />
                    ) : (
                      <>
                        <div className="candidate-card__top">
                          <strong>{question.text}</strong>
                          <span className="status">{QUESTION_ROLE_LABEL[question.role] ?? question.role}</span>
                        </div>
                        <div className="candidate-card__meta">
                          <span>{QUESTION_FORMAT_LABEL[question.format] ?? question.format}</span>
                          <span>{QUESTION_DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}</span>
                          <span>{question.skill_tag?.join(", ") || "Навык не указан"}</span>
                        </div>
                        {canEditQuestions ? (
                          <div className="page-actions">
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => setEditingQuestionId(question.id)}
                            >
                              Изменить
                            </button>
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => void handleDeleteQuestion(question)}
                            >
                              Удалить
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <ScreenState
                kind="empty"
                title="Вопросов пока нет"
                text="Соберите комплект на странице вакансии или добавьте вопрос вручную."
              />
            )}

            {canEditQuestions ? (
              <>
                <div className="page-actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => setIsAddFormOpen((value) => !value)}
                  >
                    {isAddFormOpen ? "Свернуть форму" : "Добавить вопрос"}
                  </button>
                </div>
                {isAddFormOpen ? (
                  <QuestionEditForm
                    initial={emptyQuestionForm()}
                    submitLabel="Добавить вопрос"
                    submitting={questionActionSubmitting}
                    onSubmit={(form) => void handleAddQuestion(form)}
                  />
                ) : null}

                {approveError ? <p className="form-error">{approveError}</p> : null}
                {approveStatus ? <p className="success-message">{approveStatus}</p> : null}
                <div className="form-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={approving || !canApprove}
                    onClick={() => void handleApprove()}
                  >
                    {approving ? "Одобряем…" : "Утвердить версию"}
                  </button>
                </div>
                {!canApprove ? (
                  <p className="disabled-hint">
                    Одобрить можно, когда вакансия на калибровке, в черновике или после извлечения требований.
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
