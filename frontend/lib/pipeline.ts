import type { Interview, InterviewProductState, RecruiterDecision } from "@/lib/api";

export type KanbanColumnId = "invited" | "live" | "action" | "decide" | "done";

export const KANBAN_COLUMNS: Array<{ id: KanbanColumnId; title: string }> = [
  { id: "invited", title: "Приглашены" },
  { id: "live", title: "Проходят интервью" },
  { id: "action", title: "Нужны действия" },
  { id: "decide", title: "Готовы к решению" },
  { id: "done", title: "Завершены" },
];

/** Подсказка к колонке «Завершены»: работа рекрутера на этапе закончена, не финальный оффер. */
export const DONE_COLUMN_HINT =
  "Работа рекрутера на этом этапе завершена. Это не означает финальное решение по всем кандидатам.";

const PRODUCT_COLUMN: Record<InterviewProductState, KanbanColumnId> = {
  invited: "invited",
  opened: "invited",
  consented: "invited",
  device_checked: "invited",
  ready: "invited",
  expired: "invited",
  declined: "invited",
  in_interview: "live",
  interrupted: "action",
  consent_revoked: "action",
  submitted: "action",
  report_processing: "action",
  report_ready: "decide",
  data_deleted: "done",
};

export function interviewColumn(interview: Interview): KanbanColumnId {
  if (interview.recruiter_decision && interview.recruiter_decision !== "awaiting") {
    return "done";
  }
  if (interview.product_state && PRODUCT_COLUMN[interview.product_state]) {
    if (
      interview.product_state === "report_ready" &&
      interview.recruiter_decision === "awaiting"
    ) {
      return "decide";
    }
    return PRODUCT_COLUMN[interview.product_state];
  }
  if (interview.status === "in_progress") return "live";
  if (interview.status === "completed") return "decide";
  return "invited";
}

export function groupInterviews(items: Interview[]): Record<KanbanColumnId, Interview[]> {
  const grouped: Record<KanbanColumnId, Interview[]> = {
    invited: [],
    live: [],
    action: [],
    decide: [],
    done: [],
  };
  for (const item of items) {
    grouped[interviewColumn(item)].push(item);
  }
  return grouped;
}

/** Стадия человека словами: канон запрещает показывать коды состояний. */
const STATE_LABEL: Record<InterviewProductState, string> = {
  invited: "Ссылка отправлена, ещё не открывал",
  opened: "Открыл ссылку",
  consented: "Дал согласие на запись",
  device_checked: "Проверил микрофон",
  ready: "Готов начать",
  in_interview: "Отвечает на вопросы",
  interrupted: "Прервал, может продолжить",
  submitted: "Ответы отправлены",
  report_processing: "Готовим отчёт",
  report_ready: "Отчёт готов, ждёт решения",
  expired: "Срок ссылки истёк",
  declined: "Отказался проходить",
  consent_revoked: "Отозвал согласие",
  data_deleted: "Данные удалены по запросу",
};

const DECISION_LABEL: Record<RecruiterDecision, string> = {
  awaiting: "Ждёт решения",
  handed_off: "Передан менеджеру",
  rejected: "Не продвигаем",
  closed_by_candidate: "Кандидат закрыл процесс",
};

export function interviewStageLabel(interview: Interview): string {
  if (interview.recruiter_decision && interview.recruiter_decision !== "awaiting") {
    return DECISION_LABEL[interview.recruiter_decision];
  }
  if (interview.product_state) return STATE_LABEL[interview.product_state];
  if (interview.status === "in_progress") return "Отвечает на вопросы";
  if (interview.status === "completed") return "Ответы отправлены";
  return "Ссылка отправлена, ещё не открывал";
}

/** Параметры вопроса словами: роль, формат и сложность из комплекта. */
export const QUESTION_ROLE_LABEL: Record<string, string> = {
  assessment: "Основной вопрос",
  warmup: "Разминка",
  closing: "Завершающий",
};

export const QUESTION_FORMAT_LABEL: Record<string, string> = {
  voice: "Ответ голосом",
  code_review_verbal: "Разбор кода вслух",
  live_coding: "Живое кодирование",
};

export const QUESTION_DIFFICULTY_LABEL: Record<string, string> = {
  baseline: "Базовый",
  stretch: "На вырост",
};
