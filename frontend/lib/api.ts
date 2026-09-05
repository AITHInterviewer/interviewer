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

// --- Vacancy / question / interview API (specs/003-vacancy-questions, 004-candidate-interview-flow) ---

export type VacancyStatus = "draft" | "pending_review" | "ready";

export type Vacancy = {
  id: string;
  recruiter_id: string;
  title: string;
  description: string;
  grade: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  status: VacancyStatus;
  created_at: string;
};

export type QuestionFormat = "voice" | "code_review_verbal" | "live_coding";
export type QuestionRole = "assessment" | "warmup" | "closing";
export type QuestionDifficulty = "baseline" | "stretch";
export type QuestionSource = "base_generated" | "base_edited" | "base_manual" | "dynamic";

export type Question = {
  id: string;
  vacancy_id: string;
  interview_id: string | null;
  text: string;
  order: number;
  skill_tag: string[];
  intent: string;
  reference_answer: string;
  format: QuestionFormat;
  role: QuestionRole;
  difficulty: QuestionDifficulty;
  estimated_duration_sec: number;
  stimulus: string | null;
  source: QuestionSource;
};

export type QuestionInput = {
  text: string;
  order: number;
  skill_tag: string[];
  intent: string;
  reference_answer: string;
  format: QuestionFormat;
  role: QuestionRole;
  difficulty: QuestionDifficulty;
  estimated_duration_sec: number;
  stimulus?: string | null;
};

export type VacancyDetail = Vacancy & { questions: Question[] };

export type VacancyListResponse = {
  items: Vacancy[];
};

export type Interview = {
  id: string;
  vacancy_id: string;
  candidate_name: string | null;
  resume_file_url: string;
  access_token: string;
  status: string;
  created_at: string;
};

export type InterviewListResponse = {
  items: Interview[];
};

export type CreateInterviewResponse = {
  interview: Interview;
  candidate_link: string;
};

export type InterviewEventRecord = {
  id: string;
  interview_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type InterviewAnswer = {
  id: string;
  question_id: string;
  question_text: string | null;
  transcript_text: string | null;
};

export type InterviewEventsResponse = {
  interview: Interview;
  events: InterviewEventRecord[];
  answers: InterviewAnswer[];
};

type VacancyWriteBody = {
  title: string;
  description: string;
  grade: string;
  required_skills: string[];
  nice_to_have_skills: string[];
};

async function requestMultipart<T>(
  path: string,
  options: { method?: string; token?: string; formData: FormData },
): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: options.method ?? "POST",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(payload?.detail ?? "Request failed.", response.status);
  }

  return (await response.json()) as T;
}

export function createVacancy(token: string, body: VacancyWriteBody) {
  return request<Vacancy>("/api/v1/vacancies", { method: "POST", token, body });
}

export function updateVacancy(token: string, vacancyId: string, body: Partial<VacancyWriteBody>) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}`, { method: "PATCH", token, body });
}

export function listVacancies(token: string) {
  return request<VacancyListResponse>("/api/v1/vacancies", { token });
}

export function getVacancy(token: string, vacancyId: string) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}`, { token });
}

export function generateQuestions(token: string, vacancyId: string) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}/questions/generate`, { method: "POST", token });
}

export function addQuestion(token: string, vacancyId: string, body: QuestionInput) {
  return request<Question>(`/api/v1/vacancies/${vacancyId}/questions`, { method: "POST", token, body });
}

export function updateQuestion(
  token: string,
  vacancyId: string,
  questionId: string,
  body: Partial<QuestionInput>,
) {
  return request<Question>(`/api/v1/vacancies/${vacancyId}/questions/${questionId}`, {
    method: "PATCH",
    token,
    body,
  });
}

export function deleteQuestion(token: string, vacancyId: string, questionId: string) {
  return request<void>(`/api/v1/vacancies/${vacancyId}/questions/${questionId}`, { method: "DELETE", token });
}

export function approveVacancy(token: string, vacancyId: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/approve`, { method: "POST", token });
}

export function createInterview(
  token: string,
  vacancyId: string,
  body: { resumeFile: File; candidateName?: string },
) {
  const formData = new FormData();
  formData.append("resume_file", body.resumeFile);
  if (body.candidateName) {
    formData.append("candidate_name", body.candidateName);
  }
  return requestMultipart<CreateInterviewResponse>(`/api/v1/vacancies/${vacancyId}/interviews`, {
    token,
    formData,
  });
}

export function listInterviews(token: string, vacancyId: string) {
  return request<InterviewListResponse>(`/api/v1/vacancies/${vacancyId}/interviews`, { token });
}

export function getInterview(token: string, interviewId: string) {
  return request<Interview>(`/api/v1/interviews/${interviewId}`, { token });
}

export function getInterviewEvents(token: string, interviewId: string) {
  return request<InterviewEventsResponse>(`/api/v1/interviews/${interviewId}/events`, { token });
}
