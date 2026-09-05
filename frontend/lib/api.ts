/**
 * Тонкая fetch-обёртка к backend API. Базовый URL берётся из
 * `NEXT_PUBLIC_BACKEND_URL` (клиентские вызовы) — единственная переменная, которую
 * реально читает этот файл; `BACKEND_INTERNAL_URL` (server-side fetch из RSC) здесь
 * не используется, т.к. все вызовы через `apiFetch` идут из клиентских компонентов
 * (см. specs/004-candidate-interview-flow/plan.md — control-канал и его REST-соседи
 * вызываются из браузера кандидата, не с сервера Next.js).
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(`${init?.method ?? "GET"} ${path} -> ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function backendWsUrl(path: string): string {
  const wsBase = BACKEND_URL.replace(/^http/, "ws");
  return `${wsBase}${path}`;
}

// --- Internal auth / roles API (specs/006-recruiter-auth, 007-multi-role-assignment) ---

export type InternalUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  created_by_user_id?: string | null;
};

export type AuthResponse = {
  access_token: string;
  token_type: "bearer";
  user: InternalUser;
};

export type LandingArea = {
  id: string;
  label: string;
  path: string;
};

export type LandingResponse = {
  roles: string[];
  default_path: string;
  available_areas: LandingArea[];
  available_actions: string[];
};

export type InternalUserListResponse = {
  items: InternalUser[];
};

export type RoleRegistryEntry = {
  code: string;
  title: string;
  sort_order: number;
};

export type RoleRegistrySnapshot = {
  items: RoleRegistryEntry[];
};

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(payload?.detail ?? "Request failed.", response.status);
  }

  return (await response.json()) as T;
}

export function registerRecruiter(body: { name: string; email: string; password: string }) {
  return request<AuthResponse>("/api/v1/auth/register", { method: "POST", body });
}

export function loginUser(body: { email: string; password: string }) {
  return request<AuthResponse>("/api/v1/auth/login", { method: "POST", body });
}

export function fetchCurrentUser(token: string) {
  return request<InternalUser>("/api/v1/auth/me", { token });
}

export function createInternalUser(
  token: string,
  body: { name: string; email: string; roles: string[]; temporary_password: string },
) {
  return request<InternalUser>("/api/v1/internal-users", { method: "POST", token, body });
}

export function updateRoleAssignments(
  token: string,
  userId: string,
  body: { add_roles?: string[]; remove_roles?: string[] },
) {
  return request<InternalUser>(`/api/v1/internal-users/${userId}/roles`, { method: "PATCH", token, body });
}

export function listInternalUsers(token: string) {
  return request<InternalUserListResponse>("/api/v1/internal-users", { token });
}

export function fetchLanding(token: string) {
  return request<LandingResponse>("/api/v1/internal-users/me/landing", { token });
}

export function fetchRoleRegistry(token: string) {
  return request<RoleRegistrySnapshot>("/api/v1/internal/roles", { token });
}

export function createQuestion(token: string, body: { text: string }) {
  return request<{ id: string; text: string }>("/api/v1/questions", { method: "POST", token, body });
}
