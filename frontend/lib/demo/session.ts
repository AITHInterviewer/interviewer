"use client";

import type { DemoRoleId } from "./types";

const DEMO_ROLE_KEY = "napoleon-demo-role";
const roleListeners = new Set<() => void>();

function emitDemoRole() {
  roleListeners.forEach((listener) => listener());
}

export function subscribeDemoRole(listener: () => void) {
  roleListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    roleListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getDemoRole(): DemoRoleId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEMO_ROLE_KEY);
    if (
      raw === "recruiter" ||
      raw === "expert" ||
      raw === "manager" ||
      raw === "candidate-dmitry" ||
      raw === "candidate-nikita" ||
      raw === "candidate-lida" ||
      raw === "admin"
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function setDemoRole(roleId: DemoRoleId): DemoRoleId {
  if (typeof window === "undefined") return roleId;
  window.sessionStorage.setItem(DEMO_ROLE_KEY, roleId);
  emitDemoRole();
  return roleId;
}

export function clearDemoRole(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(DEMO_ROLE_KEY);
  emitDemoRole();
}

export type CandidateSession = {
  token: string;
  started: boolean;
  interrupted: boolean;
  submitted: boolean;
  consentAudio: boolean;
  consentVideo: boolean;
  textOnly: boolean;
  practiceDone: boolean;
  currentQuestion: number;
  rephrased: number[];
  answers: Record<string, { mode: "voice" | "text"; text: string; saved: boolean }>;
  followUps: Record<string, { answer?: string; skipped?: boolean }>;
  notes: Record<string, string>;
};

const PREFIX = "napoleon-candidate-session:";

function key(token: string) {
  return `${PREFIX}${token}`;
}

export function emptySession(token: string): CandidateSession {
  return {
    token,
    started: false,
    interrupted: false,
    submitted: false,
    consentAudio: false,
    consentVideo: false,
    textOnly: false,
    practiceDone: false,
    currentQuestion: 1,
    rephrased: [],
    answers: {},
    followUps: {},
    notes: {},
  };
}

export function readSession(token: string): CandidateSession {
  if (typeof window === "undefined") return emptySession(token);
  try {
    const raw = window.sessionStorage.getItem(key(token));
    if (!raw) return emptySession(token);
    return { ...emptySession(token), ...(JSON.parse(raw) as CandidateSession), token };
  } catch {
    return emptySession(token);
  }
}

export function writeSession(session: CandidateSession): CandidateSession {
  if (typeof window === "undefined") return session;
  window.sessionStorage.setItem(key(session.token), JSON.stringify(session));
  return session;
}

export function updateSession(token: string, patch: Partial<CandidateSession>): CandidateSession {
  const next = { ...readSession(token), ...patch, token };
  return writeSession(next);
}
