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

export type VacancyStatus =
  | "draft"
  | "submitted_for_review"
  | "changes_requested"
  | "approved"
  | "archived";

export type VacancyGrade = "intern" | "junior" | "middle" | "senior" | "lead";

export type ReviewDecision = "approved" | "changes_requested";

export type ViewerPermission =
  | "vacancy.body.edit"
  | "vacancy.questions.edit"
  | "vacancy.submit"
  | "vacancy.approve"
  | "vacancy.request_changes"
  | "vacancy.archive"
  | "vacancy.restore"
  | "vacancy.review_history.view"
  | "vacancy.links.view"
  | "vacancy.links.manage";

export type VacancyQuestion = {
  id: string;
  text: string;
  order: number;
  skill_tags?: string[] | null;
  intent?: string | null;
  reference_answer?: string | null;
  format: string;
  role: string;
  difficulty: string;
  estimated_duration_sec?: number | null;
  stimulus?: string | null;
  source: string;
  updated_at: string;
};

export type ReviewState = {
  status: VacancyStatus;
  latest_review_decision?: ReviewDecision | null;
  latest_review_comment?: string | null;
  latest_reviewed_at?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by_user_id?: string | null;
  archived_at?: string | null;
  archived_by_user_id?: string | null;
};

export type VacancySummary = {
  id: string;
  title: string;
  grade?: VacancyGrade | null;
  status: VacancyStatus;
  question_count: number;
  interview_time_limit_minutes?: number | null;
  updated_at: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  latest_review_decision?: ReviewDecision | null;
};

export type VacancyDetail = {
  id: string;
  title: string;
  grade?: VacancyGrade | null;
  job_description?: string | null;
  ideal_candidate_profile?: string | null;
  required_skills: string[];
  nice_to_have_skills: string[];
  status: VacancyStatus;
  created_by_recruiter_id: string;
  created_by_user_id: string;
  managing_recruiter_id: string;
  interview_time_limit_minutes?: number | null;
  created_at: string;
  updated_at: string;
  questions: VacancyQuestion[];
  review_state: ReviewState;
  viewer_permissions: ViewerPermission[];
};

export type VacancyListResponse = {
  items: VacancySummary[];
};

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
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

export function listRecruiterVacancies(token: string, status?: VacancyStatus) {
  const suffix = status ? `?status=${status}` : "";
  return request<VacancyListResponse>(`/api/v1/vacancies${suffix}`, { token });
}

export function createRecruiterVacancy(
  token: string,
  body: {
    title?: string;
    grade?: VacancyGrade | null;
    job_description?: string | null;
    ideal_candidate_profile?: string | null;
    required_skills?: string[];
    nice_to_have_skills?: string[];
    interview_time_limit_minutes?: number | null;
  },
) {
  return request<VacancyDetail>("/api/v1/vacancies", { method: "POST", token, body });
}

export function fetchRecruiterVacancy(token: string, vacancyId: string) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}`, { token });
}

export function updateRecruiterVacancy(
  token: string,
  vacancyId: string,
  body: {
    expected_updated_at: string;
    title?: string | null;
    grade?: VacancyGrade | null;
    job_description?: string | null;
    ideal_candidate_profile?: string | null;
    required_skills?: string[];
    nice_to_have_skills?: string[];
    interview_time_limit_minutes?: number | null;
  },
) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}`, { method: "PATCH", token, body });
}

export function addRecruiterVacancyQuestion(
  token: string,
  vacancyId: string,
  body: {
    expected_updated_at: string;
    text: string;
    order?: number;
    skill_tags?: string[];
    intent?: string | null;
    reference_answer?: string | null;
    format?: string | null;
    role?: string | null;
    difficulty?: string | null;
    estimated_duration_sec?: number | null;
    stimulus?: string | null;
    source?: string | null;
  },
) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}/questions`, { method: "POST", token, body });
}

export function updateRecruiterVacancyQuestion(
  token: string,
  vacancyId: string,
  questionId: string,
  body: {
    expected_updated_at: string;
    text?: string;
    order?: number;
    skill_tags?: string[];
    intent?: string | null;
    reference_answer?: string | null;
    format?: string | null;
    role?: string | null;
    difficulty?: string | null;
    estimated_duration_sec?: number | null;
    stimulus?: string | null;
    source?: string | null;
  },
) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}/questions/${questionId}`, {
    method: "PATCH",
    token,
    body,
  });
}

export function deleteRecruiterVacancyQuestion(
  token: string,
  vacancyId: string,
  questionId: string,
  expectedUpdatedAt: string,
) {
  return request<VacancyDetail>(
    `/api/v1/vacancies/${vacancyId}/questions/${questionId}?expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`,
    {
      method: "DELETE",
      token,
    },
  );
}

export function submitRecruiterVacancy(token: string, vacancyId: string, expected_updated_at: string) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}/submit-for-review`, {
    method: "POST",
    token,
    body: { expected_updated_at },
  });
}

export function archiveRecruiterVacancy(token: string, vacancyId: string, expected_updated_at: string) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}/archive`, {
    method: "POST",
    token,
    body: { expected_updated_at },
  });
}

export function restoreRecruiterVacancy(token: string, vacancyId: string, expected_updated_at: string) {
  return request<VacancyDetail>(`/api/v1/vacancies/${vacancyId}/restore`, {
    method: "POST",
    token,
    body: { expected_updated_at },
  });
}

export function listExpertVacancies(token: string) {
  return request<VacancyListResponse>("/api/v1/expert/vacancies", { token });
}

export function fetchExpertVacancy(token: string, vacancyId: string) {
  return request<VacancyDetail>(`/api/v1/expert/vacancies/${vacancyId}`, { token });
}

export function updateExpertVacancyQuestion(
  token: string,
  vacancyId: string,
  questionId: string,
  body: {
    expected_updated_at: string;
    text?: string;
    order?: number;
    skill_tags?: string[];
    intent?: string | null;
    reference_answer?: string | null;
    format?: string | null;
    role?: string | null;
    difficulty?: string | null;
    estimated_duration_sec?: number | null;
    stimulus?: string | null;
    source?: string | null;
  },
) {
  return request<VacancyDetail>(`/api/v1/expert/vacancies/${vacancyId}/questions/${questionId}`, {
    method: "PATCH",
    token,
    body,
  });
}

export function approveExpertVacancy(
  token: string,
  vacancyId: string,
  body: { expected_updated_at: string; comment?: string },
) {
  return request<VacancyDetail>(`/api/v1/expert/vacancies/${vacancyId}/approve`, {
    method: "POST",
    token,
    body,
  });
}

export function requestExpertVacancyChanges(
  token: string,
  vacancyId: string,
  body: { expected_updated_at: string; comment?: string },
) {
  return request<VacancyDetail>(`/api/v1/expert/vacancies/${vacancyId}/request-changes`, {
    method: "POST",
    token,
    body,
  });
}

export type InterviewLinkStatus =
  | "active"
  | "in_progress"
  | "completed"
  | "expired"
  | "revoked"
  | "blocked";

export type InterviewLinkItem = {
  id: string;
  token: string;
  candidate_first_name: string;
  candidate_last_name: string;
  candidate_social: string;
  candidate_email?: string | null;
  expires_at: string;
  status: InterviewLinkStatus;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type InterviewLinkListResponse = {
  items: InterviewLinkItem[];
};

export type InterviewUnavailableReason = "expired" | "revoked" | "vacancy_closed";

export type InterviewCard = {
  state: "available" | "in_progress" | "completed" | "unavailable";
  reason?: InterviewUnavailableReason | null;
  vacancy_title: string;
  candidate_first_name: string;
  candidate_last_name?: string | null;
  expires_at?: string | null;
  deadline_at?: string | null;
  interview_time_limit_minutes?: number | null;
};

export function listVacancyLinks(token: string, vacancyId: string) {
  return request<InterviewLinkListResponse>(`/api/v1/vacancies/${vacancyId}/links`, { token });
}

export function createVacancyLink(
  token: string,
  vacancyId: string,
  body: {
    candidate_first_name: string;
    candidate_last_name: string;
    candidate_social: string;
    candidate_email?: string | null;
    expires_at: string;
  },
) {
  return request<InterviewLinkItem>(`/api/v1/vacancies/${vacancyId}/links`, {
    method: "POST",
    token,
    body,
  });
}

export function getInterviewCard(linkToken: string) {
  return request<InterviewCard>(`/api/v1/interview-links/${linkToken}`);
}

export function startInterview(linkToken: string) {
  return request<InterviewCard>(`/api/v1/interview-links/${linkToken}/start`, { method: "POST" });
}

export function revokeVacancyLink(token: string, vacancyId: string, linkId: string) {
  return request<InterviewLinkItem>(`/api/v1/vacancies/${vacancyId}/links/${linkId}/revoke`, {
    method: "POST",
    token,
  });
}

export function extendVacancyLink(
  token: string,
  vacancyId: string,
  linkId: string,
  body: { expires_at: string },
) {
  return request<InterviewLinkItem>(`/api/v1/vacancies/${vacancyId}/links/${linkId}/extend`, {
    method: "POST",
    token,
    body,
  });
}
