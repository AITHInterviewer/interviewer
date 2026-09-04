"use client";

import {
  createInternalUser,
  fetchCurrentUser,
  fetchLanding,
  listInternalUsers,
  loginUser,
  registerRecruiter,
  type AuthResponse,
  type InternalRole,
  type InternalUser,
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

export function getRolePath(role: InternalRole) {
  switch (role) {
    case "recruiter":
      return "/internal/recruiter";
    case "hiring_manager":
      return "/internal/hiring-manager";
    case "expert":
      return "/internal/expert";
  }
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

export async function createManagedInternalUser(input: {
  name: string;
  email: string;
  role: Exclude<InternalRole, "recruiter">;
  temporaryPassword: string;
}) {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return createInternalUser(session.token, {
    name: input.name,
    email: input.email,
    role: input.role,
    temporary_password: input.temporaryPassword,
  });
}

export async function loadInternalUsers() {
  const session = getSession();
  if (!session) {
    throw new Error("Authentication required.");
  }

  return listInternalUsers(session.token);
}
