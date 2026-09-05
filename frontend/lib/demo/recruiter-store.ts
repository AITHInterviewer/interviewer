"use client";

import type { Decision, DecisionKind } from "./types";

export type RecruiterStore = {
  decisions: Record<string, Decision[]>;
  invited: Array<{ id: string; name: string; email: string; deadline: string }>;
  followUpRequests: Record<string, { requirementIds: string[]; explanation: string; at: string }>;
  toasts: string[];
};

const KEY = "napoleon-recruiter-store";

export function emptyStore(): RecruiterStore {
  return {
    decisions: {},
    invited: [],
    followUpRequests: {},
    toasts: [],
  };
}

export function readStore(): RecruiterStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return emptyStore();
    return { ...emptyStore(), ...(JSON.parse(raw) as RecruiterStore) };
  } catch {
    return emptyStore();
  }
}

export function writeStore(store: RecruiterStore): RecruiterStore {
  if (typeof window === "undefined") return store;
  window.sessionStorage.setItem(KEY, JSON.stringify(store));
  return store;
}

export function appendDecision(candidateId: string, kind: DecisionKind, comment = ""): Decision {
  const store = readStore();
  const decision: Decision = {
    kind,
    author: "Анна Ковалёва",
    at: new Date().toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }),
    comment,
  };
  const history = store.decisions[candidateId] ?? [];
  writeStore({
    ...store,
    decisions: { ...store.decisions, [candidateId]: [...history, decision] },
  });
  return decision;
}

export function pushToast(message: string) {
  const store = readStore();
  writeStore({ ...store, toasts: [...store.toasts, message] });
}

export function takeToasts(): string[] {
  const store = readStore();
  const messages = store.toasts;
  if (messages.length) writeStore({ ...store, toasts: [] });
  return messages;
}
