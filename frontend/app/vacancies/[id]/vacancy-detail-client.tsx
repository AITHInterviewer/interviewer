"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { InterviewEventsPanel } from "@/components/auth/interview-events-panel";
import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import type { Interview, VacancyDetail } from "@/lib/api";
import { createManagedInterview, generateVacancyQuestions, loadInterviews, loadVacancy } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";

function statusTone(status: VacancyDetail["status"]): "positive" | "warning" | undefined {
  if (status === "ready") return "positive";
  if (status === "pending_review") return "warning";
  return undefined;
}

function candidateLink(accessToken: string): string {
  if (typeof window === "undefined") {
    return `/interview/${accessToken}`;
  }
  return `${window.location.origin}/interview/${accessToken}`;
}

export function VacancyDetailClient({ vacancyId }: { vacancyId: string }) {
  const { landing, loading } = useProtectedLanding();

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);
  const [vacancyError, setVacancyError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);
  const [interviewsError, setInterviewsError] = useState<string | null>(null);
  const [expandedInterviewId, setExpandedInterviewId] = useState<string | null>(null);

  const [candidateName, setCandidateName] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [interviewFormError, setInterviewFormError] = useState<string | null>(null);
  const [interviewFormStatus, setInterviewFormStatus] = useState<string | null>(null);
  const [interviewFormSubmitting, setInterviewFormSubmitting] = useState(false);

  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;

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

  async function refreshInterviews() {
    try {
      setInterviewsError(null);
      const response = await loadInterviews(vacancyId);
      setInterviews(response.items);
    } catch (caughtError) {
      setInterviewsError(normalizeError(caughtError, "Could not load interviews."));
    } finally {
      setInterviewsLoading(false);
    }
  }

  useEffect(() => {
    if (!landing) {
      return;
    }
    void refreshVacancy();
    void refreshInterviews();
    // Re-fetch only when the signed-in session or the vacancy id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing, vacancyId]);

  async function handleGenerateQuestions() {
    setGenerating(true);
    setGenerateError(null);

    try {
      await generateVacancyQuestions(vacancyId);
      await refreshVacancy();
    } catch (caughtError) {
      setGenerateError(normalizeError(caughtError, "Could not generate questions."));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateInterview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeFile) {
      setInterviewFormError("A resume file is required.");
      return;
    }

    setInterviewFormSubmitting(true);
    setInterviewFormError(null);
    setInterviewFormStatus(null);

    try {
      const response = await createManagedInterview(vacancyId, {
        resumeFile,
        candidateName: candidateName || undefined,
      });
      setInterviewFormStatus(`Interview created. Candidate link: ${response.candidate_link}`);
      setCandidateName("");
      setResumeFile(null);
      await refreshInterviews();
    } catch (caughtError) {
      setInterviewFormError(normalizeError(caughtError, "Could not create the interview."));
    } finally {
      setInterviewFormSubmitting(false);
    }
  }

  async function copyCandidateLink(accessToken: string) {
    try {
      await navigator.clipboard.writeText(candidateLink(accessToken));
    } catch {
      // Clipboard access can fail silently (e.g. insecure context); the link is still visible.
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

  return (
    <AppShell nav={nav} title="Vacancy">
      <div className="workspace">
        {vacancyLoading ? <ScreenState kind="loading" title="Loading" text="Loading vacancy..." /> : null}
        {vacancyError ? <ScreenState kind="error" title="Could not load vacancy" text={vacancyError} /> : null}

        {!vacancyLoading && vacancy ? (
          <>
            <PageHeader
              path="Vacancies"
              title={vacancy.title}
              description={vacancy.description}
              actions={
                <>
                  <span className="status" data-tone={statusTone(vacancy.status)}>
                    {vacancy.status}
                  </span>
                  {canManage ? (
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={vacancy.status === "ready" || generating}
                      onClick={() => void handleGenerateQuestions()}
                    >
                      {generating ? "Generating..." : "Generate questions"}
                    </button>
                  ) : null}
                  <Link className="button button--secondary" href={`/vacancies/${vacancy.id}/questions`}>
                    Questions ({vacancy.questions.length})
                  </Link>
                  {canManage ? (
                    <Link className="button button--secondary" href={`/vacancies/${vacancy.id}/settings`}>
                      Settings
                    </Link>
                  ) : null}
                  <Link className="button button--secondary" href="/vacancies/demo/board">
                    View demo evidence report
                  </Link>
                </>
              }
            />

            {generateError ? <p className="form-error">{generateError}</p> : null}

            <div className="field-block">
              <span className="path">Grade</span>
              <strong>{vacancy.grade}</strong>
            </div>
            <div className="field-block">
              <span className="path">Required skills</span>
              <span>{vacancy.required_skills.join(", ") || "—"}</span>
            </div>
            <div className="field-block">
              <span className="path">Nice-to-have skills</span>
              <span>{vacancy.nice_to_have_skills.join(", ") || "—"}</span>
            </div>

            <section className="plain-section">
              <div className="section-heading">
                <div>
                  <h2>Interviews</h2>
                </div>
              </div>

              {interviewsLoading ? (
                <ScreenState kind="loading" title="Loading" text="Loading interviews..." />
              ) : null}
              {interviewsError ? (
                <ScreenState kind="error" title="Could not load interviews" text={interviewsError} />
              ) : null}

              {!interviewsLoading && !interviewsError ? (
                interviews.length > 0 ? (
                  <div className="stack-list">
                    {interviews.map((interview) => (
                      <article className="candidate-card" key={interview.id}>
                        <div className="candidate-card__top">
                          <strong>{interview.candidate_name ?? "Unnamed candidate"}</strong>
                          <span className="status">{interview.status}</span>
                        </div>
                        <p>{candidateLink(interview.access_token)}</p>
                        <div className="page-actions">
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() => void copyCandidateLink(interview.access_token)}
                          >
                            Copy link
                          </button>
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() =>
                              setExpandedInterviewId((current) => (current === interview.id ? null : interview.id))
                            }
                          >
                            {expandedInterviewId === interview.id ? "Hide events" : "View events"}
                          </button>
                        </div>
                        {expandedInterviewId === interview.id ? (
                          <InterviewEventsPanel interviewId={interview.id} />
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <ScreenState
                    kind="empty"
                    title="No interviews yet"
                    text="Create an interview once the vacancy is ready."
                  />
                )
              ) : null}

              {canManage ? (
                <form className="form-surface" onSubmit={handleCreateInterview}>
                  <p className="path">Create interview</p>
                  <p>
                    {vacancy.status === "ready"
                      ? "Upload the candidate's resume to generate a shareable interview link."
                      : "The vacancy must be approved (status = ready) before an interview can be created."}
                  </p>
                  <label>
                    Candidate name (optional)
                    <input
                      value={candidateName}
                      onChange={(event) => setCandidateName(event.target.value)}
                      disabled={vacancy.status !== "ready"}
                    />
                  </label>
                  <label>
                    Resume file
                    <input
                      type="file"
                      onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                      disabled={vacancy.status !== "ready"}
                    />
                  </label>
                  {interviewFormError ? <p className="form-error">{interviewFormError}</p> : null}
                  {interviewFormStatus ? <p className="success-message">{interviewFormStatus}</p> : null}
                  <div className="form-actions">
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={vacancy.status !== "ready" || interviewFormSubmitting}
                    >
                      {interviewFormSubmitting ? "Creating..." : "Create interview"}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
