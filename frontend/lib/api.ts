/**
 * Тонкая fetch-обёртка к backend API. Базовый URL берётся из
 * `NEXT_PUBLIC_BACKEND_URL` (клиентские вызовы), если задан — иначе, в браузере,
 * берём origin текущей страницы (там же nginx проксирует /api/, см. infra/nginx/nginx.conf),
 * чтобы не завязываться на конкретный IP/порт раннера: сайт может быть открыт и через
 * VPN-адрес, и через внешний туннель — оба раза nginx рядом, на том же origin.
 * `BACKEND_INTERNAL_URL` (server-side fetch из RSC) здесь не используется, т.к. все вызовы
 * через `apiFetch` идут из клиентских компонентов (см.
 * specs/004-candidate-interview-flow/plan.md — control-канал и его REST-соседи вызываются
 * из браузера кандидата, не с сервера Next.js).
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:8000");

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
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
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

/**
 * Backend отдаёт `livekit_ws_url` как абсолютный адрес (см. app/config.py) — на деплое это
 * фиксированный IP раннера (VPN-адрес), который недоступен браузеру, открывшему сайт через
 * внешний туннель на другом IP. nginx проксирует /rtc/ на том же origin, с которого отдан
 * сам сайт (см. infra/nginx/nginx.conf), так что в браузере всегда безопасно подменить
 * хост на текущий origin страницы — сохраняя из ответа backend'а только путь/query.
 */
export function resolveLiveKitWsUrl(wsUrl: string): string {
  if (typeof window === "undefined") {
    return wsUrl;
  }
  const parsed = new URL(wsUrl);
  const pageWsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${pageWsProtocol}//${window.location.host}${parsed.pathname}${parsed.search}`;
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
    throw new ApiError(payload?.detail ?? "Сервер не ответил. Повторите попытку.", response.status);
  }

  return (await response.json()) as T;
}

export async function fetchInterviewRecording(token: string, interviewId: string): Promise<Blob> {
  const response = await fetch(`${BACKEND_URL}/api/v1/interviews/${interviewId}/recording`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(payload?.detail ?? "Не удалось загрузить запись интервью.", response.status);
  }
  return response.blob();
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

export type VacancyStatus =
  | "draft"
  | "extracted"
  | "calibration"
  | "changes_requested"
  | "approved"
  | "active"
  | "paused"
  | "archived"
  | "pending_review"
  | "ready";

export type RequirementKind = "must" | "nice";
export type RequirementLevel = "basic" | "confident" | "expert";

/** Требование вакансии, вычлененное из описания (specs/010-vacancy-from-description).
 * `id` живёт только на клиенте как ключ списка — бэкенд его не интерпретирует. */
export type Requirement = {
  id: string;
  name: string;
  kind: RequirementKind;
  level: RequirementLevel;
  evidence: string;
  source: "llm" | "manual" | "edited";
};

export type ExtractedRequirements = {
  title: string;
  grade: string;
  description: string;
  description_file_name: string | null;
  requirements: Requirement[];
  excluded: { text: string; reason: string }[];
  warnings: string[];
};

export type Vacancy = {
  id: string;
  recruiter_id: string;
  expert_id?: string | null;
  hiring_manager_id?: string | null;
  title: string;
  description: string;
  grade: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  // Опционально: вакансии, созданные до появления требований, приезжают с пустым списком,
  // а фикстуры моков их не заполняют.
  requirements?: Requirement[];
  description_source?: "text" | "pdf";
  description_file_name?: string | null;
  status: VacancyStatus;
  created_at: string;
  owner_next?: "recruiter" | "expert";
  candidate_count?: number;
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

export type GenerateQuestionsResponse = {
  questions: Question[];
};

export type VacancyListResponse = {
  items: Vacancy[];
};

export type InterviewProductState =
  | "invited"
  | "opened"
  | "consented"
  | "device_checked"
  | "ready"
  | "in_interview"
  | "interrupted"
  | "submitted"
  | "report_processing"
  | "report_ready"
  | "expired"
  | "declined"
  | "consent_revoked"
  | "data_deleted";

export type RecruiterDecision =
  | "awaiting"
  | "handed_off"
  | "rejected"
  | "closed_by_candidate"
  | "opinion_asked";

export type SkillClass = "fail" | "ambiguous" | "pass" | "untested";

export type SkillScoreEntry = {
  skill_tag: string;
  score: number; // 0-3
  rationale: string;
};

/** Разбор одного ответа в report_json (контракт EvaluationCreateRequest evaluation-agent). */
export type PerQuestionReport = {
  question_id: string;
  skill_scores?: SkillScoreEntry[];
  quotes?: Array<{ text: string; question_id?: string | null }>;
  confidence?: number;
  answered_with_hint: boolean;
  report: string | null;
  /** Legacy: одна оценка на вопрос вместо skill_scores (шкала могла быть 1–5). */
  score?: number;
  rationale?: string;
  skill_tag?: string[];
};

export type InterviewReport = {
  generated_at: string | null;
  model_version: string | null;
  prompt_version: string | null;
  verdict: "fits" | "not_fits" | "needs_review";
  overall_score: number | null; // 0-100
  question_score?: number | null;
  skill_score?: number | null;
  max_score?: number | null;
  score_percent?: number | null;
  skill_levels?: Array<{ skill_tag: string; level: 0 | 1 | 2 | 3 }>;
  per_question: PerQuestionReport[];
  confirmed_skills?: string[];
  unconfirmed_skills?: string[];
  skill_verdicts?: Array<{
    skill_tag: string;
    skill_class: SkillClass;
    reasoning?: string[];
    mastery_level?: number;
  }>;
  contradictions_found: Array<{ quote_a: { text: string }; quote_b: { text: string }; description: string }>;
  strengths?: string[] | string;
  risks: string[];
  summary_intro: string | null;
  summary_conclusion: string | null;
};

export type Interview = {
  id: string;
  vacancy_id: string;
  candidate_name: string | null;
  resume_file_url: string;
  access_token: string;
  status: string;
  created_at: string;
  product_state?: InterviewProductState;
  report_json?: InterviewReport | null;
  recording_url?: string | null;
  recruiter_decision?: RecruiterDecision;
  rubric_version_id?: string | null;
  /** Кому передана заявка (активный хендофф); null/отсутствует — не передавали. */
  handed_off_to?: { id: string; name: string } | null;
};

export type ClarificationRequest = {
  id: string;
  interview_id: string;
  type: "extra" | "expert_audit";
  status: string;
  close_reason?: string | null;
  extra_token?: string | null;
};

export type ManagerCandidate = {
  interview: Interview;
  vacancy_title: string;
  handed_off_at?: string | null;
  from_recruiter_name?: string | null;
  summary?: string | null;
  access: "handoff" | "opinion";
};

export type ExpertQueueResponse = {
  calibrations: Vacancy[];
  audits: Array<{
    interview: Interview;
    vacancy_id: string;
    vacancy_title: string;
    requirement?: string | null;
    reason?: string | null;
  }>;
};

export type AnonymizedStats = {
  invited: number;
  completed: number;
  awaiting_decision: number;
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
  requirements?: Requirement[];
  description_source?: "text" | "pdf";
  description_file_name?: string | null;
  expert_id?: string | null;
  hiring_manager_id?: string | null;
};

/** Требования правятся отдельной ручкой, а не общим PATCH: у них своё правило владения —
 * до калибровки список у рекрутёра, на калибровке у эксперта. */
export function putRequirements(token: string, vacancyId: string, requirements: Requirement[]) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/requirements`, {
    method: "PUT",
    token,
    body: { requirements },
  });
}

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
    throw new ApiError(payload?.detail ?? "Сервер не ответил. Повторите попытку.", response.status);
  }

  return (await response.json()) as T;
}

/** Разбор описания в требования ДО создания вакансии: либо приложенный PDF, либо текст.
 * Вакансию не создаёт — иначе каждое нажатие «Извлечь требования» плодило бы черновики. */
export function extractRequirements(
  token: string,
  input: { file: File } | { description: string },
) {
  const formData = new FormData();
  if ("file" in input) {
    formData.append("file", input.file);
  } else {
    formData.append("description", input.description);
  }
  return requestMultipart<ExtractedRequirements>("/api/v1/vacancies/extract-requirements", {
    token,
    formData,
  });
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
  return request<GenerateQuestionsResponse>(`/api/v1/vacancies/${vacancyId}/questions/generate`, {
    method: "POST",
    token,
  });
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

export function regenerateQuestion(token: string, vacancyId: string, questionId: string) {
  return request<Question>(`/api/v1/vacancies/${vacancyId}/questions/${questionId}/regenerate`, {
    method: "POST",
    token,
  });
}

export function approveVacancy(token: string, vacancyId: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/approve`, { method: "POST", token });
}

export function sendVacancyToExpert(token: string, vacancyId: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/send-to-expert`, { method: "POST", token });
}

export function requestVacancyChanges(token: string, vacancyId: string, reason: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/request-changes`, {
    method: "POST",
    token,
    body: { reason },
  });
}

export function activateVacancy(token: string, vacancyId: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/activate`, { method: "POST", token });
}

export function pauseVacancy(token: string, vacancyId: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/pause`, { method: "POST", token });
}

export function resumeVacancy(token: string, vacancyId: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/resume`, { method: "POST", token });
}

export function archiveVacancy(token: string, vacancyId: string) {
  return request<Vacancy>(`/api/v1/vacancies/${vacancyId}/archive`, { method: "POST", token });
}

export function fetchAnonymizedStats(token: string, vacancyId: string) {
  return request<AnonymizedStats>(`/api/v1/vacancies/${vacancyId}/anonymized-stats`, { token });
}

export type CandidateInterviewInfo = {
  interview_id: string;
  status: "created" | "in_progress" | "completed";
  vacancy_title: string;
  questions_total: number;
  estimated_duration_min: { min: number; max: number };
  product_state?: InterviewProductState;
  consented?: boolean;
  /** ISO-дата, до которой кандидату нужно действовать. Может отсутствовать. */
  deadline?: string | null;
};

export function fetchCandidateInterview(accessToken: string) {
  return apiFetch<CandidateInterviewInfo>(`/api/interview/${accessToken}`);
}

export function postCandidateConsent(accessToken: string) {
  return apiFetch<{ product_state: string }>(`/api/interview/${accessToken}/consent`, { method: "POST" });
}

export function postCandidateProgress(accessToken: string, product_state: InterviewProductState) {
  return apiFetch<{ product_state: string }>(`/api/interview/${accessToken}/progress`, {
    method: "POST",
    body: JSON.stringify({ product_state }),
  });
}

export function requestExtraAnswer(token: string, interviewId: string) {
  return request<ClarificationRequest>(`/api/v1/interviews/${interviewId}/extra`, { method: "POST", token });
}

export function requestExpertAudit(token: string, interviewId: string) {
  return request<ClarificationRequest>(`/api/v1/interviews/${interviewId}/audit`, { method: "POST", token });
}

export function closeClarification(token: string, interviewId: string, clarificationId: string, reason: string) {
  return request<ClarificationRequest>(`/api/v1/interviews/${interviewId}/clarifications/${clarificationId}/close`, {
    method: "POST",
    token,
    body: { reason },
  });
}

export function handoffToManager(
  token: string,
  interviewId: string,
  body: { to_manager_id: string; summary: string },
) {
  return request<{ id: string }>(`/api/v1/interviews/${interviewId}/handoff`, { method: "POST", token, body });
}

export function grantManagerOpinion(token: string, interviewId: string, managerId: string) {
  return request<{ id: string }>(`/api/v1/interviews/${interviewId}/opinion-grant`, {
    method: "POST",
    token,
    body: { manager_id: managerId },
  });
}

export function rejectInterview(token: string, interviewId: string) {
  return request<Interview>(`/api/v1/interviews/${interviewId}/reject`, { method: "POST", token });
}

export function listManagerCandidates(token: string) {
  return request<{ items: ManagerCandidate[] }>("/api/v1/manager/candidates", { token });
}

export function getManagerCandidate(token: string, interviewId: string) {
  return request<ManagerCandidate>(`/api/v1/manager/candidates/${interviewId}`, { token });
}

export function returnManagerCandidate(token: string, interviewId: string) {
  return request<Interview>(`/api/v1/manager/candidates/${interviewId}/return`, { method: "POST", token });
}

export function fetchExpertQueue(token: string) {
  return request<ExpertQueueResponse>("/api/v1/expert/queue", { token });
}

export type RubricVersion = {
  id: string;
  vacancy_id: string;
  version_number: number;
  approved_at: string | null;
  snapshot: Record<string, unknown>;
};

export type StaffManager = { id: string; name: string; email: string };

export function listClarifications(token: string, interviewId: string) {
  return request<{ items: ClarificationRequest[] }>(`/api/v1/interviews/${interviewId}/clarifications`, {
    token,
  });
}

export function listRubricVersions(token: string, vacancyId: string) {
  return request<{ items: RubricVersion[] }>(`/api/v1/vacancies/${vacancyId}/rubric-versions`, { token });
}

export function listHiringManagers(token: string) {
  return request<{ items: StaffManager[] }>("/api/v1/staff/hiring-managers", { token });
}

export function fetchCandidateExtra(accessToken: string, extraId: string) {
  return apiFetch<{ id: string; status: string; extra_token: string | null }>(
    `/api/interview/${accessToken}/extra/${extraId}`,
  );
}

export function submitCandidateExtra(accessToken: string, extraId: string, answer: string) {
  return apiFetch<{ id: string; status: string }>(`/api/interview/${accessToken}/extra/${extraId}`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
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

export function reevaluateInterview(token: string, interviewId: string) {
  return request<Interview>(`/api/v1/interviews/${interviewId}/reevaluate`, { method: "POST", token });
}
