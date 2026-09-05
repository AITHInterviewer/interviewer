"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { VacancyContextNav } from "@/components/chrome/VacancyContextNav";
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
      setVacancyError(normalizeError(caughtError, "Could not load the vacancy."));
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
      setQuestionActionError(normalizeError(caughtError, "Could not add the question."));
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
      setQuestionActionError(normalizeError(caughtError, "Could not update the question."));
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
      setQuestionActionError(normalizeError(caughtError, "Could not delete the question."));
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
      setApproveStatus("Vacancy approved");
      await refreshVacancy();
    } catch (caughtError) {
      setApproveError(normalizeError(caughtError, "Could not approve the vacancy."));
    } finally {
      setApproving(false);
    }
  }

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  const nav = buildNav(landing);
  const querySuffix = fromRecruiter ? "?from=recruiter" : "";

  return (
    <AppShell nav={nav} title="Questions">
      <div className="workspace">
        {vacancyLoading ? <ScreenState kind="loading" title="Loading" text="Loading vacancy..." /> : null}
        {vacancyError ? <ScreenState kind="error" title="Could not load vacancy" text={vacancyError} /> : null}

        {!vacancyLoading && vacancy ? (
          <>
            <PageHeader
              path={`Вакансии / ${vacancy.title}`}
              title="Вопросы"
              description={`${vacancy.questions.length} вопрос(ов)`}
            />
            {fromRecruiter ? (
              <VacancyContextNav vacancyId={vacancy.id} includeSettings={canManage} />
            ) : (
              <CalibrationSubnav vacancyId={vacancy.id} />
            )}
            <p className="page-actions">
              <Link href={`/vacancies/${vacancy.id}/rubric${querySuffix}`}>Рубрика</Link>
              <Link href={`/vacancies/${vacancy.id}/approve${querySuffix}`}>Утверждение</Link>
            </p>

            {questionActionError ? <p className="form-error">{questionActionError}</p> : null}

            {vacancy.questions.length > 0 ? (
              <div className="stack-list">
                {vacancy.questions.map((question) => (
                  <article className="candidate-card" key={question.id}>
                    {editingQuestionId === question.id ? (
                      <QuestionEditForm
                        initial={questionToForm(question)}
                        submitLabel="Save question"
                        submitting={questionActionSubmitting}
                        onSubmit={(form) => void handleUpdateQuestion(question, form)}
                      />
                    ) : (
                      <>
                        <div className="candidate-card__top">
                          <strong>{question.text}</strong>
                          <span className="status">{question.role}</span>
                        </div>
                        <div className="candidate-card__meta">
                          <span>{question.format}</span>
                          <span>{question.difficulty}</span>
                          <span>{question.skill_tag.join(", ") || "no skill tags"}</span>
                        </div>
                        {canEditQuestions ? (
                          <div className="page-actions">
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => setEditingQuestionId(question.id)}
                            >
                              Edit
                            </button>
                            <button
                              className="button button--secondary"
                              type="button"
                              onClick={() => void handleDeleteQuestion(question)}
                            >
                              Delete
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
                title="No questions yet"
                text="Generate questions from the vacancy page or add one manually."
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
                    {isAddFormOpen ? "Hide add form" : "Add question"}
                  </button>
                </div>
                {isAddFormOpen ? (
                  <QuestionEditForm
                    initial={emptyQuestionForm()}
                    submitLabel="Add question"
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
                    {approving ? "Одобряем…" : "Approve vacancy"}
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
