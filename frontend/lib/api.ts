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
