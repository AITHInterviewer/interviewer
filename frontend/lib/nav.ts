import type { LandingArea, LandingResponse } from "@/lib/api";

export const USERS_MANAGE_ACTION = "action.internal_users.manage";

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
export function buildNav(
  landing: LandingResponse,
  options?: { includeDemo?: boolean },
): { href: string; label: string }[] {
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

  if (options?.includeDemo && !seenPaths.has("/vacancies/demo/board")) {
    nav.push({ href: "/vacancies/demo/board", label: "Демо: отчёт" });
  }

  return nav;
}

export const VACANCY_STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  extracted: "Требования извлечены",
  calibration: "На калибровке",
  changes_requested: "Нужны изменения",
  approved: "Одобрена",
  active: "Активна",
  paused: "Приостановлена",
  archived: "Архивирована",
  pending_review: "На калибровке",
  ready: "Активна",
};

export const OWNER_LABEL = {
  recruiter: "Рекрутер",
  expert: "Эксперт",
} as const;

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
