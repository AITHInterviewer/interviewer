import { describe, expect, it } from "vitest";

import { vacancyNextStep } from "./nav";

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
