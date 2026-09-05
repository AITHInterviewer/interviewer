import type { InterviewLinkStatus, VacancyDetail, VacancyStatus, ViewerPermission } from "@/lib/api";

export function hasViewerPermission(
  vacancy: Pick<VacancyDetail, "viewer_permissions"> | null,
  permission: ViewerPermission,
) {
  return vacancy?.viewer_permissions.includes(permission) ?? false;
}

export function vacancyStatusTone(status: VacancyStatus): "positive" | "warning" | "danger" | undefined {
  if (status === "approved") {
    return "positive";
  }
  if (status === "submitted_for_review" || status === "changes_requested") {
    return "warning";
  }
  if (status === "archived") {
    return "danger";
  }
  return undefined;
}

export function vacancyStatusLabel(status: VacancyStatus) {
  return status.replaceAll("_", " ");
}

export function summarizeLatestReview(decision?: string | null) {
  if (!decision) {
    return "No review yet";
  }
  return decision.replaceAll("_", " ");
}

export function formatVacancyTime(value?: string | null) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function skillsFromText(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function skillsToText(values: string[] | null | undefined): string {
  return (values ?? []).join(", ");
}

export function interviewLinkStatusTone(
  status: InterviewLinkStatus,
): "positive" | "warning" | "danger" | undefined {
  if (status === "active" || status === "completed") {
    return "positive";
  }
  if (status === "in_progress") {
    return "warning";
  }
  return "danger";
}

export function interviewLinkStatusLabel(status: InterviewLinkStatus) {
  return status.replaceAll("_", " ");
}

const moscowFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMoscowDateTime(value?: string | null) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${moscowFormatter.format(date)} МСК`;
}
