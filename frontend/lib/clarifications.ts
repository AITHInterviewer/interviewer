/** Статусы открытого уточнения: бэкенд (requested/received/in_progress) + legacy «open» в фикстурах. */
export const OPEN_CLARIFICATION_STATUSES = new Set(["requested", "received", "in_progress", "open"]);

export function isClarificationOpen(status: string): boolean {
  return OPEN_CLARIFICATION_STATUSES.has(status);
}

export function openClarifications<T extends { status: string }>(items: T[]): T[] {
  return items.filter((item) => isClarificationOpen(item.status));
}

/** Статус уточнения словами: коды API в интерфейс не выносим. */
export function clarificationStatusLabel(status: string): string {
  if (status === "open" || status === "requested") return "ждёт ответа";
  if (status === "closed") return "закрыт";
  if (status === "received" || status === "answered") return "кандидат ответил";
  if (status === "in_progress") return "в работе";
  return status;
}
