import { describe, expect, it } from "vitest";

import {
  EXPERT_HOME,
  expertAuditBreadcrumbs,
  isRecruiterViewMode,
  vacancyBreadcrumbs,
  vacancyNextStep,
} from "./nav";

describe("vacancyNextStep", () => {
  it("summarizes the vacancy state in plain language", () => {
    expect(vacancyNextStep({ status: "calibration" })).toBe("На проверке у эксперта");
    expect(vacancyNextStep({ status: "pending_review" })).toBe("На проверке у эксперта");
    expect(vacancyNextStep({ status: "changes_requested" })).toBe("Нужны правки");
    expect(vacancyNextStep({ status: "approved" })).toBe("Готова к запуску");
    expect(vacancyNextStep({ status: "active" })).toBe("Пока нет кандидатов");
    expect(vacancyNextStep({ status: "ready" })).toBe("Пока нет кандидатов");
    expect(vacancyNextStep({ status: "active", candidate_count: 0 })).toBe("Пока нет кандидатов");
    expect(vacancyNextStep({ status: "active", candidate_count: 2 })).toBe("В работе");
    expect(vacancyNextStep({ status: "ready", candidate_count: 1 })).toBe("В работе");
    expect(vacancyNextStep({ status: "paused" })).toBe("На паузе");
    expect(vacancyNextStep({ status: "archived" })).toBe("В архиве");
    expect(vacancyNextStep({ status: "draft" })).toBe("Нужно собрать вопросы");
    expect(vacancyNextStep({ status: "extracted" })).toBe("Нужно собрать вопросы");
    expect(vacancyNextStep({ status: "extracted", owner_next: "expert" })).toBe("Ждёт эксперта");
  });
});

describe("navigation helpers", () => {
  it("detects recruiter view mode from query param", () => {
    expect(isRecruiterViewMode("recruiter")).toBe(true);
    expect(isRecruiterViewMode(null)).toBe(false);
  });

  it("builds vacancy breadcrumbs with board link", () => {
    expect(vacancyBreadcrumbs("v1", "Backend", "Отчёт")).toEqual([
      { label: "Вакансии", href: "/vacancies" },
      { label: "Backend", href: "/vacancies/v1" },
      { label: "Отчёт" },
    ]);
  });

  it("builds expert audit breadcrumbs back to /expert", () => {
    expect(
      expertAuditBreadcrumbs({
        vacancyId: "v1",
        vacancyTitle: "Backend",
        current: "Anna",
      }),
    ).toEqual([
      { label: "Эксперт", href: EXPERT_HOME },
      { label: "Backend", href: "/audit/v1" },
      { label: "Anna" },
    ]);
  });
});
