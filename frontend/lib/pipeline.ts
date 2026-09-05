import type { Interview, InterviewProductState } from "@/lib/api";

export type KanbanColumnId = "invited" | "live" | "action" | "decide" | "done";

export const KANBAN_COLUMNS: Array<{ id: KanbanColumnId; title: string }> = [
  { id: "invited", title: "Приглашены" },
  { id: "live", title: "Проходят интервью" },
  { id: "action", title: "Нужны действия" },
  { id: "decide", title: "Готовы к решению" },
  { id: "done", title: "Завершены" },
];

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
