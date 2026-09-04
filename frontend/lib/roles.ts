import type { RoleRegistryEntry } from "@/lib/api";

export type { RoleRegistryEntry };

export function roleTitle(entries: RoleRegistryEntry[], code: string): string {
  return entries.find((entry) => entry.code === code)?.title ?? code;
}

export function formatRoleList(entries: RoleRegistryEntry[], codes: string[]): string {
  return codes.map((code) => roleTitle(entries, code)).join(", ");
}
