"use client";

import {
  activateVacancy,
  addQuestion,
  approveVacancy,
  archiveVacancy,
  closeClarification,
  createInternalUser,
  createInterview,
  createVacancy,
  deleteQuestion,
  fetchAnonymizedStats,
  fetchCurrentUser,
  fetchExpertQueue,
  fetchLanding,
  fetchRoleRegistry,
  generateQuestions,
  getInterview,
  getInterviewEvents,
  reevaluateInterview,
  getManagerCandidate,
  returnManagerCandidate,
  getVacancy,
  grantManagerOpinion,
  handoffToManager,
  listClarifications,
  listHiringManagers,
  listInterviews,
  listInternalUsers,
  listManagerCandidates,
  listRubricVersions,
  listVacancies,
  loginUser,
  pauseVacancy,
  registerRecruiter,
  regenerateQuestion,
  requestExpertAudit,
  requestExtraAnswer,
  requestVacancyChanges,
  resumeVacancy,
  sendVacancyToExpert,
  updateQuestion,
  updateRoleAssignments,
  updateVacancy,
  type AuthResponse,
  type InternalUser,
  type LandingResponse,
  type QuestionInput,
  type RoleRegistryEntry,
} from "@/lib/api";

export const AUTH_STORAGE_KEY = "ainterviewer-auth";

export type StoredSession = {
  token: string;
  user: InternalUser;
};

export function saveSession(payload: AuthResponse) {
  if (typeof window === "undefined") {
    return;
  }

  const session: StoredSession = { token: payload.access_token, user: payload.user };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function getSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getLandingPath(landing: LandingResponse): string {
  return landing.default_path;
}

export async function resolveLandingPath(token: string): Promise<string> {
  const landing = await fetchLanding(token);
  return getLandingPath(landing);
}

export async function signUpRecruiter(input: { name: string; email: string; password: string }) {
  const response = await registerRecruiter(input);
  saveSession(response);
  return response;
}

export async function signIn(input: { email: string; password: string }) {
  const response = await loginUser(input);
  saveSession(response);
  return response;
}

export async function loadCurrentUser() {
  const session = getSession();
  if (!session) {
    return null;
  }

  try {
    const user = await fetchCurrentUser(session.token);
    const nextSession = { ...session, user };
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
    return nextSession;
  } catch {
    clearSession();
    return null;
  }
}

export async function loadLanding() {
  const session = await loadCurrentUser();
  if (!session) {
    return null;
  }

  const landing = await fetchLanding(session.token);
  return { session, landing };
}

export async function loadRoleRegistry(): Promise<RoleRegistryEntry[]> {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  const snapshot = await fetchRoleRegistry(session.token);
  return snapshot.items;
}

export async function createManagedInternalUser(input: {
  name: string;
  email: string;
  roles: string[];
  temporaryPassword: string;
}) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return createInternalUser(session.token, {
    name: input.name,
    email: input.email,
    roles: input.roles,
    temporary_password: input.temporaryPassword,
  });
}

export async function updateManagedUserRoles(
  userId: string,
  changes: { addRoles?: string[]; removeRoles?: string[] },
) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return updateRoleAssignments(session.token, userId, {
    add_roles: changes.addRoles,
    remove_roles: changes.removeRoles,
  });
}

export async function loadInternalUsers() {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return listInternalUsers(session.token);
}

// --- Vacancy / question / interview session-aware wrappers ---

export type VacancyInput = {
  title: string;
  description: string;
  grade: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  expertId?: string | null;
  hiringManagerId?: string | null;
};

export async function createManagedVacancy(input: VacancyInput) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return createVacancy(session.token, {
    title: input.title,
    description: input.description,
    grade: input.grade,
    required_skills: input.requiredSkills,
    nice_to_have_skills: input.niceToHaveSkills,
    expert_id: input.expertId ?? null,
    hiring_manager_id: input.hiringManagerId ?? null,
  });
}

export async function updateManagedVacancy(vacancyId: string, input: Partial<VacancyInput>) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return updateVacancy(session.token, vacancyId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.grade !== undefined ? { grade: input.grade } : {}),
    ...(input.requiredSkills !== undefined ? { required_skills: input.requiredSkills } : {}),
    ...(input.niceToHaveSkills !== undefined ? { nice_to_have_skills: input.niceToHaveSkills } : {}),
    ...(input.expertId !== undefined ? { expert_id: input.expertId } : {}),
    ...(input.hiringManagerId !== undefined ? { hiring_manager_id: input.hiringManagerId } : {}),
  });
}

export async function loadVacancies() {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return listVacancies(session.token);
}

export async function loadVacancy(vacancyId: string) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return getVacancy(session.token, vacancyId);
}

export async function generateVacancyQuestions(vacancyId: string) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return generateQuestions(session.token, vacancyId);
}

export async function addManagedQuestion(vacancyId: string, input: QuestionInput) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return addQuestion(session.token, vacancyId, input);
}

export async function updateManagedQuestion(
  vacancyId: string,
  questionId: string,
  input: Partial<QuestionInput>,
) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return updateQuestion(session.token, vacancyId, questionId, input);
}

export async function deleteManagedQuestion(vacancyId: string, questionId: string) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return deleteQuestion(session.token, vacancyId, questionId);
}

export async function regenerateManagedQuestion(vacancyId: string, questionId: string) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return regenerateQuestion(session.token, vacancyId, questionId);
}

export async function approveManagedVacancy(vacancyId: string) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return approveVacancy(session.token, vacancyId);
}

export async function createManagedInterview(
  vacancyId: string,
  input: { resumeFile: File; candidateName?: string },
) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return createInterview(session.token, vacancyId, input);
}

export async function loadInterviews(vacancyId: string) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return listInterviews(session.token, vacancyId);
}

export async function loadInterviewEvents(interviewId: string) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return getInterviewEvents(session.token, interviewId);
}

export async function loadInterview(interviewId: string) {
  return getInterview(requireToken(), interviewId);
}

export async function reevaluateManagedInterview(interviewId: string) {
  return reevaluateInterview(requireToken(), interviewId);
}

function requireToken() {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }
  return session.token;
}

export async function sendManagedVacancyToExpert(vacancyId: string) {
  return sendVacancyToExpert(requireToken(), vacancyId);
}

export async function requestManagedVacancyChanges(vacancyId: string, reason: string) {
  return requestVacancyChanges(requireToken(), vacancyId, reason);
}

export async function activateManagedVacancy(vacancyId: string) {
  return activateVacancy(requireToken(), vacancyId);
}

export async function pauseManagedVacancy(vacancyId: string) {
  return pauseVacancy(requireToken(), vacancyId);
}

export async function resumeManagedVacancy(vacancyId: string) {
  return resumeVacancy(requireToken(), vacancyId);
}

export async function archiveManagedVacancy(vacancyId: string) {
  return archiveVacancy(requireToken(), vacancyId);
}

export async function loadAnonymizedStats(vacancyId: string) {
  return fetchAnonymizedStats(requireToken(), vacancyId);
}

export async function requestManagedExtra(interviewId: string) {
  return requestExtraAnswer(requireToken(), interviewId);
}

export async function requestManagedAudit(interviewId: string) {
  return requestExpertAudit(requireToken(), interviewId);
}

export async function closeManagedClarification(
  interviewId: string,
  clarificationId: string,
  reason: string,
) {
  return closeClarification(requireToken(), interviewId, clarificationId, reason);
}

export async function handoffManagedInterview(
  interviewId: string,
  body: { to_manager_id: string; summary: string },
) {
  return handoffToManager(requireToken(), interviewId, body);
}

export async function grantManagedOpinion(interviewId: string, managerId: string) {
  return grantManagerOpinion(requireToken(), interviewId, managerId);
}

export async function loadManagerCandidates() {
  return listManagerCandidates(requireToken());
}

export async function loadManagerCandidate(interviewId: string) {
  return getManagerCandidate(requireToken(), interviewId);
}

export async function returnManagedCandidate(interviewId: string) {
  return returnManagerCandidate(requireToken(), interviewId);
}

export async function loadExpertQueue() {
  return fetchExpertQueue(requireToken());
}

export async function loadClarifications(interviewId: string) {
  return listClarifications(requireToken(), interviewId);
}

export async function loadRubricVersions(vacancyId: string) {
  return listRubricVersions(requireToken(), vacancyId);
}

export async function loadHiringManagers() {
  return listHiringManagers(requireToken());
}
