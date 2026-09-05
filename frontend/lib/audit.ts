/** Сквозной текст предмета аудита из данных очереди эксперта (requirement/reason опциональны). */
export function auditSubjectContext(item: {
  requirement?: string | null;
  reason?: string | null;
}): { requirement: string; reason: string; combined: string } {
  const requirement = item.requirement?.trim();
  const reason = item.reason?.trim();
  const requirementLabel = requirement ?? "Требование не указано";
  const reasonLabel = reason ?? "Причина не указана. Откройте карточку запроса.";
  let combined: string;
  if (requirement && reason) {
    combined = `Требование: ${requirement}. ${reason}`;
  } else if (requirement) {
    combined = `Требование: ${requirement}. Причина не указана. Откройте карточку запроса.`;
  } else if (reason) {
    combined = `${reason} Конкретное требование в очереди не указано — откройте карточку.`;
  } else {
    combined = "Причина не указана. Откройте карточку запроса.";
  }
  return { requirement: requirementLabel, reason: reasonLabel, combined };
}

/** @deprecated alias for list rows — same honest copy as auditSubjectContext().combined */
export function auditRowContext(item: {
  requirement?: string | null;
  reason?: string | null;
}): string {
  return auditSubjectContext(item).combined;
}
