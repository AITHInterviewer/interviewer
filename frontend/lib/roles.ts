import type { RoleRegistryEntry } from "@/lib/api";

export type { RoleRegistryEntry };

/** Роли, которых нет в реестре бэкенда, но которые встречаются у пользователей. */
const FALLBACK_TITLES: Record<string, string> = {
  admin: "Администратор",
  recruiter: "Рекрутер",
  expert: "Технический эксперт",
  hiring_manager: "Нанимающий менеджер",
};

export function roleTitle(entries: RoleRegistryEntry[], code: string): string {
  return entries.find((entry) => entry.code === code)?.title ?? FALLBACK_TITLES[code] ?? code;
}

export function formatRoleList(entries: RoleRegistryEntry[], codes: string[]): string {
  return codes.map((code) => roleTitle(entries, code)).join(", ");
}
