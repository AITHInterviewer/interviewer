import { describe, expect, it } from "vitest";

import {
  EXPERT_HOME,
  expertAuditBreadcrumbs,
  isRecruiterViewMode,
  vacancyBreadcrumbs,
  vacancyNextStep,
} from "./nav";

describe("vacancyNextStep", () => {
  it("names the actor and the action from vacancy status", () => {
    expect(vacancyNextStep({ status: "calibration" })).toBe("Эксперт проверяет комплект");
    expect(vacancyNextStep({ status: "pending_review" })).toBe("Эксперт проверяет комплект");
    expect(vacancyNextStep({ status: "changes_requested" })).toBe("Рекрутер: внести правки");
    expect(vacancyNextStep({ status: "approved" })).toBe("Рекрутер: активировать вакансию");
    expect(vacancyNextStep({ status: "active" })).toBe("Рекрутер: пригласить кандидатов");
    expect(vacancyNextStep({ status: "ready" })).toBe("Рекрутер: пригласить кандидатов");
    expect(vacancyNextStep({ status: "active", candidate_count: 0 })).toBe(
      "Рекрутер: пригласить кандидатов",
    );
    expect(vacancyNextStep({ status: "active", candidate_count: 2 })).toBe(
      "Рекрутер: работа с кандидатами",
    );
    expect(vacancyNextStep({ status: "ready", candidate_count: 1 })).toBe(
      "Рекрутер: работа с кандидатами",
    );
    expect(vacancyNextStep({ status: "paused" })).toBe("Рекрутер: возобновить вакансию");
    expect(vacancyNextStep({ status: "archived" })).toBe("В архиве");
    expect(vacancyNextStep({ status: "draft" })).toBe("Рекрутер: подготовить комплект");
    expect(vacancyNextStep({ status: "extracted" })).toBe("Рекрутер: подготовить комплект");
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
