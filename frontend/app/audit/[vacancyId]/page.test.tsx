import { describe, expect, it } from "vitest";

import { auditRowContext } from "./page";

describe("auditRowContext", () => {
  const base = {
    vacancy_id: "v1",
    vacancy_title: "Backend",
    interview: { id: "i1", candidate_name: "Anna" },
  } as const;

  it("combines requirement and reason when both exist", () => {
    expect(
      auditRowContext({
        ...base,
        requirement: "Python",
        reason: "Нужен второй взгляд",
      } as never),
    ).toBe("Требование: Python. Нужен второй взгляд");
  });

  it("uses honest copy when reason is missing", () => {
    expect(
      auditRowContext({
        ...base,
        requirement: "Python",
        reason: null,
      } as never),
    ).toBe("Требование: Python. Причина не указана. Откройте карточку запроса.");
  });

  it("uses honest copy when both requirement and reason are missing", () => {
    expect(
      auditRowContext({
        ...base,
        requirement: null,
        reason: null,
      } as never),
    ).toBe("Причина не указана. Откройте карточку запроса.");
  });
});
