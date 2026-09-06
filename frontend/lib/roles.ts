import type { RoleRegistryEntry } from "@/lib/api";

export type { RoleRegistryEntry };

/** Подписи для известных ролей, если реестр ещё не загрузился. Без выдуманного admin. */
const FALLBACK_TITLES: Record<string, string> = {
  recruiter: "Рекрутер",
  expert: "Технический эксперт",
  hiring_manager: "Нанимающий менеджер",
};

export function roleTitle(entries: RoleRegistryEntry[], code: string): string {
  return entries.find((entry) => entry.code === code)?.title ?? FALLBACK_TITLES[code] ?? code;
}

export function assignedRegistryRoles(entries: RoleRegistryEntry[], codes: string[]): string[] {
  const known = new Set(entries.map((entry) => entry.code));
  return codes.filter((code) => known.has(code));
}

export function formatRoleList(entries: RoleRegistryEntry[], codes: string[]): string {
  return assignedRegistryRoles(entries, codes)
    .map((code) => roleTitle(entries, code))
    .join(", ");
}
