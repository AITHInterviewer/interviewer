import { describe, expect, it } from "vitest";

import { auditRowContext, auditSubjectContext } from "@/lib/audit";

describe("auditSubjectContext", () => {
  it("combines requirement and reason when both exist", () => {
    const ctx = auditSubjectContext({
      requirement: "Python",
      reason: "Нужен второй взгляд",
    });
    expect(ctx.combined).toBe("Требование: Python. Нужен второй взгляд");
    expect(ctx.requirement).toBe("Python");
    expect(ctx.reason).toBe("Нужен второй взгляд");
  });

  it("uses honest copy when requirement is missing", () => {
    const ctx = auditSubjectContext({ requirement: null, reason: null });
    expect(ctx.requirement).toBe("Требование не указано");
    expect(ctx.reason).toMatch(/причина не указана/i);
    expect(auditRowContext({ requirement: null, reason: null })).toMatch(/причина не указана/i);
  });
});
