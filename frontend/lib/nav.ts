import type { LandingArea, LandingResponse, Vacancy } from "@/lib/api";

export const USERS_MANAGE_ACTION = "action.internal_users.manage";

// Грейд — обязательное непустое поле на бэкенде (VacancyCreate.grade), поэтому
// "без грейда" — тоже значение, а не пустая строка.
export const GRADE_OPTIONS = [
  { value: "unspecified", label: " " },
  { value: "intern", label: "Стажёр" },
  { value: "junior", label: "Junior" },
  { value: "junior_plus", label: "Junior+" },
  { value: "middle", label: "Middle" },
  { value: "middle_plus", label: "Middle+" },
  { value: "senior", label: "Senior" },
  { value: "senior_plus", label: "Senior+" },
  { value: "lead", label: "Lead" },
];

export function gradeLabel(value: string): string {
  return GRADE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

const HIDDEN_PATHS = new Set(["/overview", "/candidates", "/internal/hiring-manager"]);

const AREA_HREF: Record<string, string> = {
  "area.recruiter_workspace": "/vacancies",
  "area.expert_questions": "/expert",
  "area.hiring_manager_review": "/manager",
};

const AREA_LABEL: Record<string, string> = {
  "area.recruiter_workspace": "Вакансии",
  "area.expert_questions": "Эксперт",
  "area.hiring_manager_review": "Встречи",
};

function areaHref(area: LandingArea): string | null {
  const href = AREA_HREF[area.id] ?? area.path;
  if (HIDDEN_PATHS.has(href) || href === "/overview" || href.startsWith("/candidates")) {
    return null;
  }
  return href;
}

/**
 * Builds AppShell nav items from the real landing response: one entry per available area
 * (deduped by path, since a combo-role user's areas can point at the same real route), plus
 * a "Users" entry when the signed-in user can manage internal users.
 */
export function buildNav(landing: LandingResponse): { href: string; label: string }[] {
  const seenPaths = new Set<string>();
  const nav: { href: string; label: string }[] = [];

  for (const area of landing.available_areas) {
    const href = areaHref(area);
    if (!href || seenPaths.has(href)) {
      continue;
    }
    seenPaths.add(href);
    nav.push({ href, label: AREA_LABEL[area.id] ?? area.label });
  }

  if (landing.available_actions.includes(USERS_MANAGE_ACTION) && !seenPaths.has("/internal/users")) {
    nav.push({ href: "/internal/users", label: "Пользователи" });
  }

  return nav;
}

export const VACANCY_STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  extracted: "Требования извлечены",
  calibration: "На проверке у эксперта",
  changes_requested: "Нужны изменения",
  approved: "Одобрена",
  active: "Активна",
  paused: "Приостановлена",
  archived: "Архивирована",
  pending_review: "На проверке у эксперта",
  ready: "Активна",
};

/** Человекочитаемые названия ролей — для меню аккаунта и подобных мест. */
export const ROLE_LABEL: Record<string, string> = {
  recruiter: "Рекрутер",
  expert: "Эксперт",
  hiring_manager: "Hiring-менеджер",
};

export function vacancyNextStep(
  vacancy: Pick<Vacancy, "status" | "owner_next" | "candidate_count">,
): string {
  switch (vacancy.status) {
    case "calibration":
    case "pending_review":
      return "На проверке у эксперта";
    case "changes_requested":
      return "Нужны правки";
    case "approved":
      return "Готова к запуску";
    case "active":
    case "ready":
      return (vacancy.candidate_count ?? 0) > 0 ? "В работе" : "Пока нет кандидатов";
    case "paused":
      return "На паузе";
    case "archived":
      return "В архиве";
    case "draft":
    case "extracted":
      return vacancy.owner_next === "expert" ? "Ждёт эксперта" : "Нужно собрать вопросы";
    default:
      return "Нужно собрать вопросы";
  }
}

/** Склонение «кандидат»: 1 кандидат, 2 кандидата, 5 кандидатов. */
export function candidateCountLabel(count: number | undefined): string {
  const n = count ?? 0;
  if (n === 0) return "Нет кандидатов";
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "кандидатов";
  if (mod10 === 1 && mod100 !== 11) word = "кандидат";
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = "кандидата";
  return `${n} ${word}`;
}

export function vacancyContextNav(
  vacancyId: string,
  options?: { includeSettings?: boolean },
): { href: string; label: string }[] {
  const items = [
    { href: `/vacancies/${vacancyId}`, label: "Доска" },
    { href: `/vacancies/${vacancyId}/rubric?from=recruiter`, label: "Рубрика" },
    { href: `/vacancies/${vacancyId}/questions?from=recruiter`, label: "Вопросы" },
  ];
  if (options?.includeSettings !== false) {
    items.push({ href: `/vacancies/${vacancyId}/settings`, label: "Настройки" });
  }
  return items;
}

export const EXPERT_HOME = "/expert";

export function isRecruiterViewMode(from: string | null | undefined): boolean {
  return from === "recruiter";
}

export type Breadcrumb = { label: string; href?: string };

/** Крошки внутри вакансии: Вакансии → доска → текущий экран. */
export function vacancyBreadcrumbs(
  vacancyId: string,
  vacancyTitle: string,
  current?: string,
): Breadcrumb[] {
  const items: Breadcrumb[] = [
    { label: "Вакансии", href: "/vacancies" },
    { label: vacancyTitle, href: `/vacancies/${vacancyId}` },
  ];
  if (current) {
    items.push({ label: current });
  }
  return items;
}

/** Крошки экспертского аудита: возврат на /expert, не в рекрутерский кабинет. */
export function expertAuditBreadcrumbs(options?: {
  vacancyTitle?: string;
  vacancyId?: string;
  current?: string;
}): Breadcrumb[] {
  const items: Breadcrumb[] = [{ label: "Эксперт", href: EXPERT_HOME }];
  if (options?.vacancyTitle && options.vacancyId) {
    items.push({
      label: options.vacancyTitle,
      href: `/audit/${options.vacancyId}`,
    });
  }
  if (options?.current) {
    items.push({ label: options.current });
  }
  return items;
}

export function calibrationSubnavItems(vacancyId: string): { href: string; label: string }[] {
  return [
    { href: `/vacancies/${vacancyId}/rubric`, label: "Критерии" },
    { href: `/vacancies/${vacancyId}/questions`, label: "Вопросы" },
    { href: `/vacancies/${vacancyId}/approve`, label: "Утверждение" },
  ];
}
