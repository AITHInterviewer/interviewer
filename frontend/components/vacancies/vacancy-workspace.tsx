"use client";

import { useEffect, useRef, useState } from "react";

import {
  addRecruiterVacancyQuestion,
  ApiError,
  approveExpertVacancy,
  archiveRecruiterVacancy,
  deleteRecruiterVacancyQuestion,
  fetchExpertVacancy,
  fetchRecruiterVacancy,
  requestExpertVacancyChanges,
  restoreRecruiterVacancy,
  submitRecruiterVacancy,
  type VacancyDetail,
  updateExpertVacancyQuestion,
  updateRecruiterVacancy,
  updateRecruiterVacancyQuestion,
} from "@/lib/api";
import { getSession, loadLanding } from "@/lib/auth";
import { hasViewerPermission, skillsFromText } from "@/lib/vacancies";

import { createVacancyDraft, VacancyFormSections, type VacancyDraft } from "./vacancy-form-sections";
import { type QuestionDraft, VacancyQuestionList } from "./vacancy-question-list";
import { ReviewStatePanel } from "./review-state-panel";

type VacancyWorkspaceProps = {
  vacancyId: string;
};

async function loadVacancy(vacancyId: string): Promise<{ vacancy: VacancyDetail; mode: "recruiter" | "expert" }> {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  const landingResult = await loadLanding();
  const canTryExpert = landingResult?.landing.available_areas.some((area) => area.id === "area.expert_questions") ?? false;
  const canTryRecruiter = landingResult?.landing.available_areas.some((area) => area.id === "area.recruiter_workspace") ?? false;

  if (canTryExpert) {
    try {
      return { vacancy: await fetchExpertVacancy(session.token, vacancyId), mode: "expert" };
    } catch (error) {
      if (!(error instanceof ApiError) || !canTryRecruiter || ![403, 404].includes(error.status)) {
        throw error;
      }
    }
  }

  if (canTryRecruiter) {
    return { vacancy: await fetchRecruiterVacancy(session.token, vacancyId), mode: "recruiter" };
  }

  throw new Error("No vacancy access available for this session.");
}

export function VacancyWorkspace({ vacancyId }: VacancyWorkspaceProps) {
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [mode, setMode] = useState<"recruiter" | "expert">("recruiter");
  const [draft, setDraft] = useState<VacancyDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, QuestionDraft>>({});
  const [dirtyQuestionIds, setDirtyQuestionIds] = useState<string[]>([]);
  const draftRef = useRef<VacancyDraft | null>(null);
  const questionDraftsRef = useRef<Record<string, QuestionDraft>>({});
  const dirtyQuestionIdsRef = useRef<Set<string>>(new Set());

  function buildQuestionDrafts(next: VacancyDetail): Record<string, QuestionDraft> {
    return Object.fromEntries(
      next.questions.map((question) => [
        question.id,
        {
          text: question.text,
          reference_answer: question.reference_answer ?? "",
          skill_tags: (question.skill_tags ?? []).join(", "),
          intent: question.intent ?? "",
        },
      ]),
    );
  }

  function applyVacancy(
    next: VacancyDetail,
    nextMode?: "recruiter" | "expert",
    options?: { preserveQuestionDrafts?: boolean },
  ) {
    setVacancy(next);
    const nextDraft = createVacancyDraft(next);
    const nextQuestionDrafts = buildQuestionDrafts(next);
    draftRef.current = nextDraft;
    if (!options?.preserveQuestionDrafts) {
      questionDraftsRef.current = nextQuestionDrafts;
      dirtyQuestionIdsRef.current = new Set();
      setQuestionDrafts(nextQuestionDrafts);
      setDirtyQuestionIds([]);
    }
    setDraft(nextDraft);
    setIsDraftDirty(false);
    if (nextMode) {
      setMode(nextMode);
    }
  }

  function handleDraftChange(next: VacancyDraft) {
    draftRef.current = next;
    setDraft(next);
    setIsDraftDirty(true);
  }

  function handleQuestionDraftChange(questionId: string, next: QuestionDraft) {
    questionDraftsRef.current = {
      ...questionDraftsRef.current,
      [questionId]: next,
    };
    dirtyQuestionIdsRef.current.add(questionId);
    setQuestionDrafts(questionDraftsRef.current);
    setDirtyQuestionIds(Array.from(dirtyQuestionIdsRef.current));
  }

  async function refresh() {
    const next = await loadVacancy(vacancyId);
    applyVacancy(next.vacancy, next.mode);
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const next = await loadVacancy(vacancyId);
        if (cancelled) {
          return;
        }
        setVacancy(next.vacancy);
        const nextDraft = createVacancyDraft(next.vacancy);
        const nextQuestionDrafts = buildQuestionDrafts(next.vacancy);
        draftRef.current = nextDraft;
        questionDraftsRef.current = nextQuestionDrafts;
        dirtyQuestionIdsRef.current = new Set();
        setDraft(nextDraft);
        setQuestionDrafts(nextQuestionDrafts);
        setDirtyQuestionIds([]);
        setIsDraftDirty(false);
        setMode(next.mode);
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Could not load vacancy.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [vacancyId]);

  async function run(action: () => Promise<VacancyDetail>, successMessage: string, nextMode?: "recruiter" | "expert") {
    try {
      setError(null);
      const next = await action();
      applyVacancy(next, nextMode);
      setStatus(successMessage);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Request failed.");
    }
  }

  async function persistRecruiterDraft(options?: { force?: boolean }): Promise<VacancyDetail> {
    if (!vacancy || !draftRef.current) {
      throw new Error("Vacancy draft is unavailable.");
    }
    if (!session) {
      throw new Error("Authentication required.");
    }
    if (!hasViewerPermission(vacancy, "vacancy.body.edit")) {
      return vacancy;
    }
    if (!options?.force && !isDraftDirty) {
      return vacancy;
    }

    const next = await updateRecruiterVacancy(session.token, vacancy.id, {
      expected_updated_at: vacancy.updated_at,
      title: draftRef.current.title,
      grade: draftRef.current.grade || null,
      job_description: draftRef.current.job_description,
      ideal_candidate_profile: draftRef.current.ideal_candidate_profile,
      required_skills: skillsFromText(draftRef.current.required_skills),
      nice_to_have_skills: skillsFromText(draftRef.current.nice_to_have_skills),
    });
    applyVacancy(next, "recruiter", { preserveQuestionDrafts: true });
    return next;
  }

  async function persistDirtyQuestions(currentVacancy: VacancyDetail): Promise<VacancyDetail> {
    if (!session) {
      throw new Error("Authentication required.");
    }
    let latest = currentVacancy;

    for (const questionId of dirtyQuestionIdsRef.current) {
      const draftQuestion = questionDraftsRef.current[questionId];
      if (!draftQuestion) {
        continue;
      }

      latest =
        mode === "expert"
          ? await updateExpertVacancyQuestion(session.token, latest.id, questionId, {
              expected_updated_at: latest.updated_at,
              text: draftQuestion.text,
              reference_answer: draftQuestion.reference_answer || null,
              skill_tags: skillsFromText(draftQuestion.skill_tags),
              intent: draftQuestion.intent || null,
            })
          : await updateRecruiterVacancyQuestion(session.token, latest.id, questionId, {
              expected_updated_at: latest.updated_at,
              text: draftQuestion.text,
              reference_answer: draftQuestion.reference_answer || null,
              skill_tags: skillsFromText(draftQuestion.skill_tags),
              intent: draftQuestion.intent || null,
            });
      applyVacancy(latest, mode);
    }

    return latest;
  }

  async function persistAllRecruiterChanges(options?: { forceBody?: boolean }): Promise<VacancyDetail> {
    let latest = vacancy;
    if (!latest) {
      throw new Error("Vacancy is unavailable.");
    }
    latest = await persistRecruiterDraft({ force: options?.forceBody });
    latest = await persistDirtyQuestions(latest);
    return latest;
  }

  async function persistAllQuestionChanges(): Promise<VacancyDetail> {
    if (!vacancy) {
      throw new Error("Vacancy is unavailable.");
    }
    return persistDirtyQuestions(vacancy);
  }

  if (loading) {
    return <div className="loading-panel"><strong>Loading vacancy...</strong></div>;
  }

  if (!vacancy || !draft) {
    return <div className="placeholder-card"><strong>{error ?? "Vacancy unavailable."}</strong></div>;
  }

  const session = getSession();
  const canEditBody = hasViewerPermission(vacancy, "vacancy.body.edit");
  const canEditQuestions = hasViewerPermission(vacancy, "vacancy.questions.edit");

  return (
    <div className="vacancy-workspace">
      <div className="page-title vacancy-page-title">
        <div>
          <p className="path">Internal / vacancy</p>
          <h1>{vacancy.title || "Untitled vacancy"}</h1>
          <p className="page-title__description">
            Shared vacancy workspace for recruiter authoring and expert review.
          </p>
        </div>
        <div className="page-actions">
          {canEditBody ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() =>
                void run(
                  async () => {
                    if (!session) {
                      throw new Error("Authentication required.");
                    }
                    return persistAllRecruiterChanges({ forceBody: true });
                  },
                  "Vacancy and questions saved.",
                  "recruiter",
                )
              }
            >
              Save vacancy
            </button>
          ) : null}
          <button className="button button--ghost" type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="field-error">{error}</p> : null}
      {status ? <p className="success-message">{status}</p> : null}

      <div className="vacancy-layout">
        <div className="vacancy-layout__main">
          <VacancyFormSections vacancy={vacancy} draft={draft} readOnly={!canEditBody} onChange={handleDraftChange} />
          <VacancyQuestionList
            key={vacancy.updated_at}
            questions={vacancy.questions}
            drafts={questionDrafts}
            canEdit={canEditQuestions}
            onChange={handleQuestionDraftChange}
            onAdd={async (text) => {
              if (!session) {
                throw new Error("Authentication required.");
              }
              const currentVacancy = await persistAllRecruiterChanges();
              await run(
                () =>
                  addRecruiterVacancyQuestion(session.token, currentVacancy.id, {
                    expected_updated_at: currentVacancy.updated_at,
                    text,
                  }),
                "Vacancy saved and question added.",
                "recruiter",
              );
              setNewQuestionText("");
            }}
            onDelete={async (questionId) => {
              if (!session) {
                throw new Error("Authentication required.");
              }
              const currentVacancy =
                mode === "recruiter"
                  ? await persistAllRecruiterChanges()
                  : await persistAllQuestionChanges();
              await run(
                () =>
                  deleteRecruiterVacancyQuestion(
                    session.token,
                    currentVacancy.id,
                    questionId,
                    currentVacancy.updated_at,
                  ),
                "Question deleted.",
                mode,
              );
            }}
            newQuestionText={newQuestionText}
            onNewQuestionTextChange={setNewQuestionText}
          />
        </div>

        <ReviewStatePanel
          vacancy={vacancy}
          reviewComment={reviewComment}
          onReviewCommentChange={setReviewComment}
          onSubmit={
            hasViewerPermission(vacancy, "vacancy.submit") && session
              ? async () =>
                  run(
                    async () => {
                      const currentVacancy = await persistAllRecruiterChanges();
                      return submitRecruiterVacancy(
                        session.token,
                        currentVacancy.id,
                        currentVacancy.updated_at,
                      );
                    },
                    "Vacancy submitted for review.",
                    "recruiter",
                  )
              : null
          }
          onApprove={
            hasViewerPermission(vacancy, "vacancy.approve") && session
              ? async () =>
                  run(
                    async () => {
                      const currentVacancy = await persistAllQuestionChanges();
                      return approveExpertVacancy(session.token, currentVacancy.id, {
                        expected_updated_at: currentVacancy.updated_at,
                        comment: reviewComment,
                      });
                    },
                    "Vacancy approved.",
                    "expert",
                  )
              : null
          }
          onRequestChanges={
            hasViewerPermission(vacancy, "vacancy.request_changes") && session
              ? async () =>
                  run(
                    async () => {
                      const currentVacancy = await persistAllQuestionChanges();
                      return requestExpertVacancyChanges(session.token, currentVacancy.id, {
                        expected_updated_at: currentVacancy.updated_at,
                        comment: reviewComment,
                      });
                    },
                    "Changes requested.",
                    "expert",
                  )
              : null
          }
          onArchive={
            hasViewerPermission(vacancy, "vacancy.archive") && session
              ? async () =>
                  run(
                    async () => {
                      const currentVacancy = await persistAllRecruiterChanges();
                      return archiveRecruiterVacancy(
                        session.token,
                        currentVacancy.id,
                        currentVacancy.updated_at,
                      );
                    },
                    "Vacancy archived.",
                    "recruiter",
                  )
              : null
          }
          onRestore={
            hasViewerPermission(vacancy, "vacancy.restore") && session
              ? async () =>
                  run(
                    () => restoreRecruiterVacancy(session.token, vacancy.id, vacancy.updated_at),
                    "Vacancy restored.",
                    "recruiter",
                  )
              : null
          }
        />
      </div>
    </div>
  );
}
