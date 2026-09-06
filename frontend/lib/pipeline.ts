import type { StatusTone } from "@/components/ui/status-pill";
import type { Interview, InterviewProductState } from "@/lib/api";
import { interviewScore } from "@/lib/report";

export type KanbanColumnId = "invited" | "interviewed" | "evaluated" | "done";

export const KANBAN_COLUMNS: Array<{ id: KanbanColumnId; title: string }> = [
  { id: "invited", title: "Пригласили" },
  { id: "interviewed", title: "Интервью" },
  { id: "evaluated", title: "Отчёт" },
  { id: "done", title: "Завершены" },
];

const PRODUCT_COLUMN: Record<InterviewProductState, KanbanColumnId> = {
  invited: "invited",
  opened: "invited",
  consented: "invited",
  device_checked: "invited",
  ready: "invited",
  in_interview: "invited",
  interrupted: "invited",
  submitted: "interviewed",
  report_processing: "interviewed",
  report_ready: "evaluated",
  expired: "done",
  declined: "done",
  consent_revoked: "done",
  data_deleted: "done",
};

export function interviewColumn(interview: Interview): KanbanColumnId {
  if (interview.recruiter_decision && interview.recruiter_decision !== "awaiting") {
    return "done";
  }
  if (interview.product_state && PRODUCT_COLUMN[interview.product_state]) {
    return PRODUCT_COLUMN[interview.product_state];
  }
  if (interview.status === "in_progress") return "invited";
  if (interview.status === "completed") return "interviewed";
  return "invited";
}

export function interviewMark(interview: Interview): { label: string; tone: StatusTone } {
  const decision = interview.recruiter_decision;
  if (decision === "handed_off") return { label: "Прошёл", tone: "positive" };
  if (decision === "opinion_asked") return { label: "Нужна проверка", tone: "warning" };
  if (decision === "rejected" || decision === "closed_by_candidate") {
    return { label: "Не прошёл", tone: "danger" };
  }
  const state = interview.product_state;
  if (
    state === "expired" ||
    state === "declined" ||
    state === "consent_revoked" ||
    state === "data_deleted"
  ) {
    return { label: "Не прошёл", tone: "danger" };
  }
  if (state === "report_ready" && (decision === "awaiting" || !decision)) {
    return { label: "Ждёт решения", tone: "warning" };
  }
  if (state === "submitted" || state === "report_processing") {
    return { label: "Готовим отчёт", tone: "warning" };
  }
  if (state === "in_interview") return { label: "Отвечает", tone: "warning" };
  if (state === "interrupted") return { label: "Прервал", tone: "warning" };
  if (state === "invited") return { label: "Ссылка отправлена", tone: "unchecked" };
  if (state === "opened") return { label: "Открыл ссылку", tone: "unchecked" };
  if (state === "consented") return { label: "Дал согласие", tone: "unchecked" };
  if (state === "device_checked") return { label: "Проверил микрофон", tone: "unchecked" };
  if (state === "ready") return { label: "Готов начать", tone: "unchecked" };
  return { label: "Ссылка отправлена", tone: "unchecked" };
}

/** Стадия человека словами: канон запрещает показывать коды состояний. */
export function interviewStageLabel(interview: Interview): string {
  return interviewMark(interview).label;
}

export function rankingScore(interview: Interview): number | null {
  return interviewScore(interview)?.percent ?? null;
}

export function formatRankingScore(score: number): string {
  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function candidateName(interview: Interview): string {
  return interview.candidate_name ?? "";
}

export function sortByRanking(items: Interview[]): Interview[] {
  return [...items].sort((left, right) => {
    const leftScore = rankingScore(left);
    const rightScore = rankingScore(right);
    if (leftScore == null && rightScore == null) {
      return candidateName(left).localeCompare(candidateName(right), "ru");
    }
    if (leftScore == null) return 1;
    if (rightScore == null) return -1;
    if (leftScore !== rightScore) return rightScore - leftScore;
    return candidateName(left).localeCompare(candidateName(right), "ru");
  });
}

export function groupInterviews(items: Interview[]): Record<KanbanColumnId, Interview[]> {
  const grouped: Record<KanbanColumnId, Interview[]> = {
    invited: [],
    interviewed: [],
    evaluated: [],
    done: [],
  };
  for (const item of items) {
    grouped[interviewColumn(item)].push(item);
  }
  grouped.evaluated = sortByRanking(grouped.evaluated);
  grouped.done = sortByRanking(grouped.done);
  return grouped;
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
  live_coding: "Live-coding",
};

export const QUESTION_DIFFICULTY_LABEL: Record<string, string> = {
  baseline: "Базовый",
  stretch: "На вырост",
};
