import type { LandingResponse } from "@/lib/api";

export const USERS_MANAGE_ACTION = "action.internal_users.manage";

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
    if (seenPaths.has(area.path)) {
      continue;
    }
    seenPaths.add(area.path);
    nav.push({ href: area.path, label: area.label });
  }

  if (landing.available_actions.includes(USERS_MANAGE_ACTION) && !seenPaths.has("/internal/users")) {
    nav.push({ href: "/internal/users", label: "Users" });
  }

  if (options?.includeDemo && !seenPaths.has("/vacancies/demo/board")) {
    nav.push({ href: "/vacancies/demo/board", label: "Demo: evidence report" });
  }

  return nav;
}
