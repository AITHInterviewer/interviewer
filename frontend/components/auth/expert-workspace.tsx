"use client";

import { useEffect, useState } from "react";

import {
  ApiError,
  type Question,
  type QuestionDifficulty,
  type QuestionFormat,
  type QuestionInput,
  type QuestionRole,
  type Vacancy,
  type VacancyDetail,
} from "@/lib/api";
import {
  addManagedQuestion,
  approveManagedVacancy,
  deleteManagedQuestion,
  loadLanding,
  loadVacancies,
  loadVacancy,
  updateManagedQuestion,
} from "@/lib/auth";

const QUESTIONS_EDIT_ACTION = "action.questions.edit";

const QUESTION_FORMATS: QuestionFormat[] = ["voice", "code_review_verbal", "live_coding"];
const QUESTION_ROLES: QuestionRole[] = ["assessment", "warmup", "closing"];
const QUESTION_DIFFICULTIES: QuestionDifficulty[] = ["baseline", "stretch"];

function normalizeError(caughtError: unknown, fallback: string): string {
  if (caughtError instanceof ApiError) {
    return caughtError.message;
  }
  if (caughtError instanceof Error) {
    return caughtError.message;
  }
  return fallback;
}

type QuestionFormState = {
  text: string;
  skillTag: string;
  intent: string;
  referenceAnswer: string;
  format: QuestionFormat;
  role: QuestionRole;
  difficulty: QuestionDifficulty;
  estimatedDurationSec: string;
};

function emptyQuestionForm(): QuestionFormState {
  return {
    text: "",
    skillTag: "",
    intent: "",
    referenceAnswer: "",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimatedDurationSec: "120",
  };
}

function toQuestionInput(form: QuestionFormState, order: number): QuestionInput {
  return {
    text: form.text,
    order,
    skill_tag: form.skillTag
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    intent: form.intent,
    reference_answer: form.referenceAnswer,
    format: form.format,
    role: form.role,
    difficulty: form.difficulty,
    estimated_duration_sec: Number(form.estimatedDurationSec) || 0,
  };
}

function questionToForm(question: Question): QuestionFormState {
  return {
    text: question.text,
    skillTag: question.skill_tag.join(", "),
    intent: question.intent,
    referenceAnswer: question.reference_answer,
    format: question.format,
    role: question.role,
    difficulty: question.difficulty,
    estimatedDurationSec: String(question.estimated_duration_sec),
  };
}

function QuestionEditForm({
  initial,
  submitLabel,
  submitting,
  onSubmit,
}: {
  initial: QuestionFormState;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (form: QuestionFormState) => void;
}) {
  const [form, setForm] = useState<QuestionFormState>(initial);

  function update<K extends keyof QuestionFormState>(key: K, value: QuestionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Text
        <textarea value={form.text} onChange={(event) => update("text", event.target.value)} required />
      </label>
      <label>
        Skill tags (comma-separated)
        <input value={form.skillTag} onChange={(event) => update("skillTag", event.target.value)} />
      </label>
      <label>
        Intent
        <textarea value={form.intent} onChange={(event) => update("intent", event.target.value)} />
      </label>
      <label>
        Reference answer
        <textarea value={form.referenceAnswer} onChange={(event) => update("referenceAnswer", event.target.value)} />
      </label>
      <label>
        Format
        <select value={form.format} onChange={(event) => update("format", event.target.value as QuestionFormat)}>
          {QUESTION_FORMATS.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
      </label>
      <label>
        Role
        <select value={form.role} onChange={(event) => update("role", event.target.value as QuestionRole)}>
          {QUESTION_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>
      <label>
        Difficulty
        <select value={form.difficulty} onChange={(event) => update("difficulty", event.target.value as QuestionDifficulty)}>
          {QUESTION_DIFFICULTIES.map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {difficulty}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estimated duration (seconds)
        <input
          type="number"
          value={form.estimatedDurationSec}
          onChange={(event) => update("estimatedDurationSec", event.target.value)}
        />
      </label>
      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function ExpertWorkspace() {
  const [availableActions, setAvailableActions] = useState<string[] | null>(null);

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(true);
  const [vacanciesError, setVacanciesError] = useState<string | null>(null);

  const [selectedVacancy, setSelectedVacancy] = useState<VacancyDetail | null>(null);
  const [vacancyDetailLoading, setVacancyDetailLoading] = useState(false);
  const [vacancyDetailError, setVacancyDetailError] = useState<string | null>(null);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [questionActionError, setQuestionActionError] = useState<string | null>(null);
  const [questionActionSubmitting, setQuestionActionSubmitting] = useState(false);

  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveStatus, setApproveStatus] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadLanding()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setAvailableActions(result?.landing.available_actions ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableActions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const canEditQuestions = availableActions?.includes(QUESTIONS_EDIT_ACTION) ?? false;

  async function refreshVacancies() {
    try {
      setVacanciesLoading(true);
      setVacanciesError(null);
      const response = await loadVacancies();
      setVacancies(response.items.filter((vacancy) => vacancy.status === "pending_review"));
    } catch (caughtError) {
      setVacanciesError(normalizeError(caughtError, "Could not load vacancies."));
    } finally {
      setVacanciesLoading(false);
    }
  }

  useEffect(() => {
    if (!canEditQuestions) {
      return;
    }

    let cancelled = false;

    loadVacancies()
      .then((response) => {
        if (!cancelled) {
          setVacancies(response.items.filter((vacancy) => vacancy.status === "pending_review"));
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setVacanciesError(normalizeError(caughtError, "Could not load vacancies."));
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
  }, [canEditQuestions]);

  async function openVacancy(vacancyId: string) {
    setVacancyDetailLoading(true);
    setVacancyDetailError(null);
    setApproveError(null);
    setApproveStatus(null);
    setEditingQuestionId(null);
    setIsAddFormOpen(false);

    try {
      const detail = await loadVacancy(vacancyId);
      setSelectedVacancy(detail);
    } catch (caughtError) {
      setVacancyDetailError(normalizeError(caughtError, "Could not load the vacancy."));
    } finally {
      setVacancyDetailLoading(false);
    }
  }

  async function refreshSelectedVacancy() {
    if (!selectedVacancy) {
      return;
    }
    const detail = await loadVacancy(selectedVacancy.id);
    setSelectedVacancy(detail);
  }

  async function handleAddQuestion(form: QuestionFormState) {
    if (!selectedVacancy) {
      return;
    }
    setQuestionActionSubmitting(true);
    setQuestionActionError(null);

    try {
      const order = selectedVacancy.questions.length;
      await addManagedQuestion(selectedVacancy.id, toQuestionInput(form, order));
      setIsAddFormOpen(false);
      await refreshSelectedVacancy();
    } catch (caughtError) {
      setQuestionActionError(normalizeError(caughtError, "Could not add the question."));
    } finally {
      setQuestionActionSubmitting(false);
    }
  }

  async function handleUpdateQuestion(question: Question, form: QuestionFormState) {
    if (!selectedVacancy) {
      return;
    }
    setQuestionActionSubmitting(true);
    setQuestionActionError(null);

    try {
      await updateManagedQuestion(selectedVacancy.id, question.id, toQuestionInput(form, question.order));
      setEditingQuestionId(null);
      await refreshSelectedVacancy();
    } catch (caughtError) {
      setQuestionActionError(normalizeError(caughtError, "Could not update the question."));
    } finally {
      setQuestionActionSubmitting(false);
    }
  }

  async function handleDeleteQuestion(question: Question) {
    if (!selectedVacancy) {
      return;
    }
    setQuestionActionError(null);

    try {
      await deleteManagedQuestion(selectedVacancy.id, question.id);
      await refreshSelectedVacancy();
    } catch (caughtError) {
      setQuestionActionError(normalizeError(caughtError, "Could not delete the question."));
    }
  }

  async function handleApprove() {
    if (!selectedVacancy) {
      return;
    }
    setApproving(true);
    setApproveError(null);
    setApproveStatus(null);

    try {
      await approveManagedVacancy(selectedVacancy.id);
      setApproveStatus("Vacancy approved.");
      await refreshSelectedVacancy();
      await refreshVacancies();
    } catch (caughtError) {
      setApproveError(normalizeError(caughtError, "Could not approve the vacancy."));
    } finally {
      setApproving(false);
    }
  }

  if (availableActions === null) {
    return <p className="field-hint">Loading expert capabilities...</p>;
  }

  if (!canEditQuestions) {
    return (
      <div className="placeholder-card recruiter-helper-card">
        <span className="status">Expert area</span>
        <strong>Question editing is not available for your current roles.</strong>
      </div>
    );
  }

  return (
    <section className="recruiter-shell">
      <div className="recruiter-panel-grid">
        <section className="recruiter-users-panel">
          <div className="section-heading">
            <div>
              <h2>Vacancies pending review</h2>
            </div>
            <div className="page-actions">
              <button className="button button--secondary" type="button" onClick={() => void refreshVacancies()}>
                Refresh list
              </button>
            </div>
          </div>

          {vacanciesError ? <p className="field-error recruiter-panel-message">{vacanciesError}</p> : null}
          {vacanciesLoading ? <p className="recruiter-panel-message">Loading vacancies...</p> : null}

          {!vacanciesLoading ? (
            <div className="recruiter-user-list">
              {vacancies.length > 0 ? (
                vacancies.map((vacancy) => (
                  <article className="candidate-card recruiter-user-card" key={vacancy.id}>
                    <div className="candidate-card__top">
                      <strong>{vacancy.title}</strong>
                      <span className="status" data-tone="warning">{vacancy.status}</span>
                    </div>
                    <div className="candidate-card__meta recruiter-user-card__meta">
                      <span>{vacancy.grade}</span>
                    </div>
                    <div className="page-actions">
                      <button className="button button--primary" type="button" onClick={() => void openVacancy(vacancy.id)}>
                        Review
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="placeholder-card recruiter-helper-card">
                  <span className="status">Vacancies</span>
                  <strong>No vacancies pending review.</strong>
                  <p>Vacancies appear here once a recruiter generates questions.</p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        <aside className="recruiter-side-panel">
          <div className="section-heading">
            <div>
              <h2>{selectedVacancy ? selectedVacancy.title : "Review"}</h2>
            </div>
          </div>
          <div className="recruiter-side-panel__body">
            {vacancyDetailLoading ? <p className="field-hint">Loading vacancy...</p> : null}
            {vacancyDetailError ? <p className="field-error">{vacancyDetailError}</p> : null}

            {!vacancyDetailLoading && selectedVacancy ? (
              <>
                {questionActionError ? <p className="field-error">{questionActionError}</p> : null}

                <div className="recruiter-user-list">
                  {selectedVacancy.questions.map((question) => (
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
                        </>
                      )}
                    </article>
                  ))}
                </div>

                <div className="page-actions">
                  <button className="button button--secondary" type="button" onClick={() => setIsAddFormOpen((value) => !value)}>
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

                {approveError ? <p className="field-error">{approveError}</p> : null}
                {approveStatus ? <p className="success-message">{approveStatus}</p> : null}
                <div className="form-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={approving || selectedVacancy.status === "ready"}
                    onClick={() => void handleApprove()}
                  >
                    {approving ? "Approving..." : "Approve vacancy"}
                  </button>
                </div>
              </>
            ) : null}

            {!vacancyDetailLoading && !selectedVacancy ? (
              <div className="placeholder-card recruiter-helper-card">
                <span className="status" data-tone="warning">Start here</span>
                <strong>Select a vacancy to review its questions.</strong>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
