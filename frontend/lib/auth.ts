"use client";

import {
  addQuestion,
  approveVacancy,
  createInternalUser,
  createInterview,
  createVacancy,
  deleteQuestion,
  fetchCurrentUser,
  fetchLanding,
  fetchRoleRegistry,
  generateQuestions,
  getInterviewEvents,
  getVacancy,
  listInterviews,
  listInternalUsers,
  listVacancies,
  loginUser,
  registerRecruiter,
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
