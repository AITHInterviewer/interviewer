"use client";

import { useEffect, useState } from "react";

import { InternalUserForm } from "@/components/auth/internal-user-form";
import { InterviewEventsPanel } from "@/components/auth/interview-events-panel";
import { ApiError, type Interview, type InternalUser, type Vacancy } from "@/lib/api";
import {
  createManagedInterview,
  createManagedVacancy,
  generateVacancyQuestions,
  loadInternalUsers,
  loadInterviews,
  loadLanding,
  loadRoleRegistry,
  loadVacancies,
} from "@/lib/auth";
import { formatRoleList, type RoleRegistryEntry } from "@/lib/roles";

const VACANCIES_AREA = "area.recruiter_workspace";

const tabs = [
  { id: "vacancies", label: "Vacancies", state: "active" },
  { id: "candidates", label: "Candidates", state: "placeholder" },
  { id: "users", label: "Users", state: "active" },
] as const;

type RecruiterTabId = (typeof tabs)[number]["id"];

function normalizeError(caughtError: unknown, fallback: string): string {
  if (caughtError instanceof ApiError) {
    return caughtError.message;
  }
  if (caughtError instanceof Error) {
    return caughtError.message;
  }
  return fallback;
}

function statusTone(status: Vacancy["status"]): "warning" | "positive" {
  return status === "ready" ? "positive" : "warning";
}

function splitSkills(value: string): string[] {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

export function RecruiterWorkspace() {
  const [activeTab, setActiveTab] = useState<RecruiterTabId>("vacancies");
  const [canManageVacancies, setCanManageVacancies] = useState<boolean | null>(null);

  const [users, setUsers] = useState<InternalUser[]>([]);
  const [roleRegistry, setRoleRegistry] = useState<RoleRegistryEntry[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(true);
  const [vacanciesError, setVacanciesError] = useState<string | null>(null);
  const [isVacancyFormOpen, setIsVacancyFormOpen] = useState(false);
  const [vacancyActionError, setVacancyActionError] = useState<string | null>(null);
  const [generatingVacancyId, setGeneratingVacancyId] = useState<string | null>(null);
  const [expandedVacancyId, setExpandedVacancyId] = useState<string | null>(null);

  const [vacancyTitle, setVacancyTitle] = useState("");
  const [vacancyDescription, setVacancyDescription] = useState("");
  const [vacancyGrade, setVacancyGrade] = useState("");
  const [vacancyRequiredSkills, setVacancyRequiredSkills] = useState("");
  const [vacancyNiceToHaveSkills, setVacancyNiceToHaveSkills] = useState("");
  const [vacancyFormError, setVacancyFormError] = useState<string | null>(null);
  const [vacancyFormSubmitting, setVacancyFormSubmitting] = useState(false);

  const [interviewsByVacancy, setInterviewsByVacancy] = useState<Record<string, Interview[]>>({});
  const [interviewsLoading, setInterviewsLoading] = useState<string | null>(null);
  const [interviewsError, setInterviewsError] = useState<string | null>(null);
  const [expandedInterviewId, setExpandedInterviewId] = useState<string | null>(null);

  const [candidateName, setCandidateName] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [interviewFormError, setInterviewFormError] = useState<string | null>(null);
  const [interviewFormStatus, setInterviewFormStatus] = useState<string | null>(null);
  const [interviewFormSubmitting, setInterviewFormSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadLanding()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setCanManageVacancies(result?.landing.available_areas.some((area) => area.id === VACANCIES_AREA) ?? false);
      })
      .catch(() => {
        if (!cancelled) {
          setCanManageVacancies(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshUsers(options?: { preserveLoading?: boolean }) {
    try {
      if (!options?.preserveLoading) {
        setUsersLoading(true);
      }
      setUsersError(null);
      const response = await loadInternalUsers();
      setUsers(response.items);
    } catch (caughtError) {
      setUsersError(normalizeError(caughtError, "Could not load internal users."));
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadInternalUsers(), loadRoleRegistry()])
      .then(([usersResponse, registryEntries]) => {
        if (cancelled) {
          return;
        }

        setUsers(usersResponse.items);
        setRoleRegistry(registryEntries);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) {
          return;
        }
        setUsersError(normalizeError(caughtError, "Could not load internal users."));
      })
      .finally(() => {
        if (!cancelled) {
          setUsersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshVacancies(options?: { preserveLoading?: boolean }) {
    try {
      if (!options?.preserveLoading) {
        setVacanciesLoading(true);
      }
      setVacanciesError(null);
      const response = await loadVacancies();
      setVacancies(response.items);
    } catch (caughtError) {
      setVacanciesError(normalizeError(caughtError, "Could not load vacancies."));
    } finally {
      setVacanciesLoading(false);
    }
  }

  useEffect(() => {
    if (canManageVacancies !== true) {
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
  }, [canManageVacancies]);

  async function handleCreateVacancy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVacancyFormSubmitting(true);
    setVacancyFormError(null);

    try {
      await createManagedVacancy({
        title: vacancyTitle,
        description: vacancyDescription,
        grade: vacancyGrade,
        requiredSkills: splitSkills(vacancyRequiredSkills),
        niceToHaveSkills: splitSkills(vacancyNiceToHaveSkills),
      });
      setVacancyTitle("");
      setVacancyDescription("");
      setVacancyGrade("");
      setVacancyRequiredSkills("");
      setVacancyNiceToHaveSkills("");
      setIsVacancyFormOpen(false);
      await refreshVacancies({ preserveLoading: false });
    } catch (caughtError) {
      setVacancyFormError(normalizeError(caughtError, "Could not create the vacancy."));
    } finally {
      setVacancyFormSubmitting(false);
    }
  }

  async function handleGenerateQuestions(vacancyId: string) {
    setGeneratingVacancyId(vacancyId);
    setVacancyActionError(null);

    try {
      await generateVacancyQuestions(vacancyId);
      await refreshVacancies({ preserveLoading: true });
    } catch (caughtError) {
      setVacancyActionError(normalizeError(caughtError, "Could not generate questions."));
    } finally {
      setGeneratingVacancyId(null);
    }
  }

  async function toggleVacancyInterviews(vacancyId: string) {
    if (expandedVacancyId === vacancyId) {
      setExpandedVacancyId(null);
      return;
    }

    setExpandedVacancyId(vacancyId);
    setExpandedInterviewId(null);
    setInterviewFormStatus(null);
    setInterviewFormError(null);
    setInterviewsError(null);
    setInterviewsLoading(vacancyId);

    try {
      const response = await loadInterviews(vacancyId);
      setInterviewsByVacancy((current) => ({ ...current, [vacancyId]: response.items }));
    } catch (caughtError) {
      setInterviewsError(normalizeError(caughtError, "Could not load interviews."));
    } finally {
      setInterviewsLoading(null);
    }
  }

  async function handleCreateInterview(vacancyId: string, event: React.FormEvent<HTMLFormElement>) {
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
      const refreshed = await loadInterviews(vacancyId);
      setInterviewsByVacancy((current) => ({ ...current, [vacancyId]: refreshed.items }));
    } catch (caughtError) {
      setInterviewFormError(normalizeError(caughtError, "Could not create the interview."));
    } finally {
      setInterviewFormSubmitting(false);
    }
  }

  function candidateLink(accessToken: string): string {
    if (typeof window === "undefined") {
      return `/interview/${accessToken}`;
    }
    return `${window.location.origin}/interview/${accessToken}`;
  }

  async function copyCandidateLink(accessToken: string) {
    const link = candidateLink(accessToken);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard access can fail silently (e.g. insecure context); the link is still visible.
    }
  }

  return (
    <section className="recruiter-shell">
      <div className="recruiter-tabs" role="tablist" aria-label="Recruiter workspace tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className="recruiter-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.state === "placeholder" ? <small>coming later</small> : null}
          </button>
        ))}
      </div>

      {activeTab === "users" ? (
        <div className="recruiter-panel-grid">
          <section className="recruiter-users-panel">
            <div className="section-heading">
              <div>
                <h2>Internal users</h2>
              </div>
              <div className="page-actions">
                <button className="button button--primary" type="button" onClick={() => setIsComposerOpen((value) => !value)}>
                  {isComposerOpen ? "Hide form" : "Add new user"}
                </button>
                <button className="button button--secondary" type="button" onClick={() => void refreshUsers({ preserveLoading: false })}>
                  Refresh list
                </button>
              </div>
            </div>

            {usersError ? <p className="field-error recruiter-panel-message">{usersError}</p> : null}
            {usersLoading ? <p className="recruiter-panel-message">Loading internal users...</p> : null}

            {!usersLoading ? (
              <div className="recruiter-user-list">
                {users.length > 0 ? (
                  users.map((user) => (
                    <article className="candidate-card recruiter-user-card" key={user.id}>
                      <div className="candidate-card__top">
                        <div className="recruiter-user-card__identity">
                          <strong>{user.name}</strong>
                          <span className="field-hint inline-code">{user.email}</span>
                        </div>
                        <span className="status">{formatRoleList(roleRegistry, user.roles)}</span>
                      </div>
                      <div className="candidate-card__meta recruiter-user-card__meta">
                        <span>Recruiter-created</span>
                        <span>{user.created_by_user_id ? "Managed account" : "Unlinked account"}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="placeholder-card recruiter-helper-card">
                    <span className="status">Users</span>
                    <strong>No managed users yet.</strong>
                    <p>Create a hiring manager or expert account to populate this tab for the current recruiter.</p>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <aside className="recruiter-side-panel">
            <div className="section-heading">
              <div>
                <h2>User creation</h2>
              </div>
            </div>
            <div className="recruiter-side-panel__body">
              <p className="field-hint">Use a temporary password for MVP. Invite-based setup can replace this flow later.</p>
              <InternalUserForm
                hidden={!isComposerOpen}
                onCreated={() => {
                  setIsComposerOpen(false);
                  void refreshUsers({ preserveLoading: false });
                }}
              />
              {!isComposerOpen ? (
                <div className="placeholder-card recruiter-helper-card">
                  <span className="status" data-tone="warning">Start here</span>
                  <strong>Use “Add new user” to open the creation form.</strong>
                  <p>Keep the user list visible while you onboard hiring managers and experts.</p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {activeTab === "vacancies" ? (
        canManageVacancies === null ? (
          <p className="field-hint">Loading recruiter capabilities...</p>
        ) : !canManageVacancies ? (
          <div className="placeholder-card recruiter-helper-card">
            <span className="status">Vacancies</span>
            <strong>Vacancy management is not available for your current roles.</strong>
          </div>
        ) : (
          <div className="recruiter-panel-grid">
            <section className="recruiter-users-panel">
              <div className="section-heading">
                <div>
                  <h2>Vacancies</h2>
                </div>
                <div className="page-actions">
                  <button className="button button--primary" type="button" onClick={() => setIsVacancyFormOpen((value) => !value)}>
                    {isVacancyFormOpen ? "Hide form" : "Create vacancy"}
                  </button>
                  <button className="button button--secondary" type="button" onClick={() => void refreshVacancies({ preserveLoading: false })}>
                    Refresh list
                  </button>
                </div>
              </div>

              {vacanciesError ? <p className="field-error recruiter-panel-message">{vacanciesError}</p> : null}
              {vacancyActionError ? <p className="field-error recruiter-panel-message">{vacancyActionError}</p> : null}
              {vacanciesLoading ? <p className="recruiter-panel-message">Loading vacancies...</p> : null}

              {!vacanciesLoading ? (
                <div className="recruiter-user-list">
                  {vacancies.length > 0 ? (
                    vacancies.map((vacancy) => (
                      <article className="candidate-card recruiter-user-card" key={vacancy.id}>
                        <div className="candidate-card__top">
                          <div className="recruiter-user-card__identity">
                            <strong>{vacancy.title}</strong>
                            <span className="field-hint">{vacancy.grade}</span>
                          </div>
                          <span className="status" data-tone={statusTone(vacancy.status)}>{vacancy.status}</span>
                        </div>
                        <div className="candidate-card__meta recruiter-user-card__meta">
                          <span>Created {new Date(vacancy.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="page-actions">
                          <button
                            className="button button--secondary"
                            type="button"
                            disabled={vacancy.status === "ready" || generatingVacancyId === vacancy.id}
                            onClick={() => void handleGenerateQuestions(vacancy.id)}
                          >
                            {generatingVacancyId === vacancy.id ? "Generating..." : "Generate questions"}
                          </button>
                          <button
                            className="button button--secondary"
                            type="button"
                            onClick={() => void toggleVacancyInterviews(vacancy.id)}
                          >
                            {expandedVacancyId === vacancy.id ? "Hide interviews" : "Manage interviews"}
                          </button>
                        </div>

                        {expandedVacancyId === vacancy.id ? (
                          <div className="recruiter-side-panel__body">
                            {interviewsLoading === vacancy.id ? <p className="field-hint">Loading interviews...</p> : null}
                            {interviewsError ? <p className="field-error">{interviewsError}</p> : null}

                            {(interviewsByVacancy[vacancy.id] ?? []).map((interview) => (
                              <div className="placeholder-card recruiter-helper-card" key={interview.id}>
                                <div className="candidate-card__top">
                                  <strong>{interview.candidate_name ?? "Unnamed candidate"}</strong>
                                  <span className="status">{interview.status}</span>
                                </div>
                                <p className="field-hint inline-code">{candidateLink(interview.access_token)}</p>
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
                              </div>
                            ))}

                            <form
                              className="auth-form"
                              onSubmit={(event) => void handleCreateInterview(vacancy.id, event)}
                            >
                              <div className="form-intro">
                                <span className="status">Create interview</span>
                                <p className="field-hint">
                                  {vacancy.status === "ready"
                                    ? "Upload the candidate's resume to generate a shareable interview link."
                                    : "The vacancy must be approved (status = ready) before an interview can be created."}
                                </p>
                              </div>
                              <label>
                                Candidate name (optional)
                                <input
                                  value={candidateName}
                                  onChange={(event) => setCandidateName(event.target.value)}
                                  name="candidateName"
                                  disabled={vacancy.status !== "ready"}
                                />
                              </label>
                              <label>
                                Resume file
                                <input
                                  type="file"
                                  name="resumeFile"
                                  onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                                  disabled={vacancy.status !== "ready"}
                                />
                              </label>
                              {interviewFormError ? <p className="field-error">{interviewFormError}</p> : null}
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
                          </div>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="placeholder-card recruiter-helper-card">
                      <span className="status">Vacancies</span>
                      <strong>No vacancies yet.</strong>
                      <p>Create a vacancy to start the review and interview pipeline.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            <aside className="recruiter-side-panel">
              <div className="section-heading">
                <div>
                  <h2>Vacancy creation</h2>
                </div>
              </div>
              <div className="recruiter-side-panel__body">
                <form className="auth-form" onSubmit={handleCreateVacancy} hidden={!isVacancyFormOpen}>
                  <div className="form-intro">
                    <span className="status">Recruiter-only</span>
                    <p className="field-hint">Skills fields accept comma-separated values.</p>
                  </div>
                  <label>
                    Title
                    <input value={vacancyTitle} onChange={(event) => setVacancyTitle(event.target.value)} name="title" required />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={vacancyDescription}
                      onChange={(event) => setVacancyDescription(event.target.value)}
                      name="description"
                      required
                    />
                  </label>
                  <label>
                    Grade
                    <input value={vacancyGrade} onChange={(event) => setVacancyGrade(event.target.value)} name="grade" required />
                  </label>
                  <label>
                    Required skills
                    <input
                      value={vacancyRequiredSkills}
                      onChange={(event) => setVacancyRequiredSkills(event.target.value)}
                      name="requiredSkills"
                      placeholder="python, sql"
                    />
                  </label>
                  <label>
                    Nice-to-have skills
                    <input
                      value={vacancyNiceToHaveSkills}
                      onChange={(event) => setVacancyNiceToHaveSkills(event.target.value)}
                      name="niceToHaveSkills"
                      placeholder="docker, kubernetes"
                    />
                  </label>
                  {vacancyFormError ? <p className="field-error">{vacancyFormError}</p> : null}
                  <div className="form-actions">
                    <button className="button button--primary" type="submit" disabled={vacancyFormSubmitting}>
                      {vacancyFormSubmitting ? "Creating..." : "Create vacancy"}
                    </button>
                  </div>
                </form>
                {!isVacancyFormOpen ? (
                  <div className="placeholder-card recruiter-helper-card">
                    <span className="status" data-tone="warning">Start here</span>
                    <strong>Use “Create vacancy” to open the creation form.</strong>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        )
      ) : null}

      {activeTab === "candidates" ? (
        <section className="placeholder-card recruiter-placeholder-panel">
          <span className="status" data-tone="warning">Placeholder</span>
          <strong>Candidates tab is reserved for interview result workflows.</strong>
          <p>
            This tab is part of the final workspace structure, but the full flow will be implemented in a later feature slice.
          </p>
        </section>
      ) : null}
    </section>
  );
}
