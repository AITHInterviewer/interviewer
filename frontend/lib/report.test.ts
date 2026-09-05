import { describe, expect, it } from "vitest";

import type { InterviewAnswer, Question } from "@/lib/api";
import {
  buildRequirementMap,
  isReportProcessing,
  mandatoryGapRows,
  mandatoryGapWarning,
  mandatorySummary,
  optionalGapRows,
  analysisSourceLabel,
  requirementConclusion,
  uncoveredRequirements,
  PROCESSING_COPY,
} from "@/lib/report";

function question(id: string, order: number, skills: string[]): Question {
  return {
    id,
    vacancy_id: "v1",
    interview_id: null,
    text: `Вопрос ${order}`,
    order,
    skill_tag: skills,
    intent: "",
    reference_answer: "",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimated_duration_sec: 240,
    stimulus: null,
    source: "base_generated",
  };
}

function answer(questionId: string, text: string | null): InterviewAnswer {
  return { id: `a-${questionId}`, question_id: questionId, question_text: null, transcript_text: text };
}

describe("buildRequirementMap", () => {
  const vacancy = { required_skills: ["Python", "SQL", "Celery"], nice_to_have_skills: ["Docker"] };
  const questions = [question("q1", 1, ["Python"]), question("q2", 2, ["SQL"]), question("q3", 3, ["Docker"])];

  it("маркирует требование без вопроса как незаданное", () => {
    const rows = buildRequirementMap(vacancy, questions, []);
    expect(rows.find((row) => row.skill === "Celery")?.coverage).toBe("not-covered");
    expect(uncoveredRequirements(rows).map((row) => row.skill)).toEqual(["Celery"]);
  });

  it("различает заданный вопрос без ответа и ответ с расшифровкой", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "Разбирала event loop"), answer("q2", null)]);
    expect(rows.find((row) => row.skill === "Python")?.coverage).toBe("answered");
    expect(rows.find((row) => row.skill === "SQL")?.coverage).toBe("asked");
  });

  it("непустая расшифровка даёт coverage answered, но не confirmed", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "Разбирала event loop")]);
    const python = rows.find((row) => row.skill === "Python");
    expect(python?.coverage).toBe("answered");
    expect(requirementConclusion(python!)).toBe("unavailable");
    expect(requirementConclusion(python!)).not.toBe("confirmed");
  });

  it("пустая или отсутствующая расшифровка — asked, не confirmed", () => {
    const empty = buildRequirementMap(vacancy, questions, [answer("q2", "")]);
    const missing = buildRequirementMap(vacancy, questions, [answer("q2", null)]);
    expect(empty.find((row) => row.skill === "SQL")?.coverage).toBe("asked");
    expect(missing.find((row) => row.skill === "SQL")?.coverage).toBe("asked");
    expect(requirementConclusion(empty.find((row) => row.skill === "SQL")!)).not.toBe("confirmed");
    expect(requirementConclusion(missing.find((row) => row.skill === "SQL")!)).not.toBe("confirmed");
  });

  it("требование без вопроса — not-covered, не confirmed", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "текст")]);
    const celery = rows.find((row) => row.skill === "Celery");
    expect(celery?.coverage).toBe("not-covered");
    expect(requirementConclusion(celery!)).toBe("unavailable");
    expect(requirementConclusion(celery!)).not.toBe("confirmed");
  });

  it("считает только обязательные требования", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "текст"), answer("q3", "текст")]);
    expect(mandatorySummary(rows)).toEqual({ answered: 1, total: 3 });
  });

  it("сопоставляет теги без учёта регистра и пробелов", () => {
    const rows = buildRequirementMap(
      { required_skills: [" python "], nice_to_have_skills: [] },
      [question("q1", 1, ["Python"])],
      [answer("q1", "ответ")],
    );
    expect(rows[0].coverage).toBe("answered");
  });
});

describe("requirementConclusion", () => {
  it("без analysis не подтверждает навык даже при теге и расшифровке", () => {
    const rows = buildRequirementMap(
      { required_skills: ["Python"], nice_to_have_skills: [] },
      [question("q1", 1, ["Python"])],
      [answer("q1", "Разбирала event loop")],
    );
    expect(rows[0].coverage).toBe("answered");
    expect(requirementConclusion(rows[0])).toBe("unavailable");
    expect(requirementConclusion(rows[0], undefined)).toBe("unavailable");
    expect(requirementConclusion(rows[0], {})).toBe("unavailable");
  });
});

describe("isReportProcessing", () => {
  it("true при report_status processing", () => {
    expect(isReportProcessing({ report_status: "processing" })).toBe(true);
  });

  it("true при product_state report_processing", () => {
    expect(isReportProcessing({ product_state: "report_processing" })).toBe(true);
  });

  it("false когда отчёт не в обработке", () => {
    expect(isReportProcessing({ report_status: "ready", product_state: "report_ready" })).toBe(false);
    expect(isReportProcessing({})).toBe(false);
  });
});

describe("mandatoryGapRows", () => {
  const vacancy = { required_skills: ["Python", "SQL"], nice_to_have_skills: ["Docker"] };
  const questions = [question("q1", 1, ["Python"]), question("q2", 2, ["SQL"]), question("q3", 3, ["Docker"])];

  it("не включает желательные пробелы", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "ответ")]);
    expect(mandatoryGapRows(rows).map((row) => row.skill)).toEqual(["SQL"]);
    expect(optionalGapRows(rows).map((row) => row.skill)).toEqual(["Docker"]);
  });

  it("формирует предупреждение только по обязательным", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "ответ")]);
    expect(mandatoryGapWarning(rows)).toMatch(/SQL/);
    expect(mandatoryGapWarning(rows)).not.toMatch(/Docker/);
  });

  it("null когда обязательные закрыты ответами", () => {
    const rows = buildRequirementMap(vacancy, questions, [
      answer("q1", "a"),
      answer("q2", "b"),
      answer("q3", "c"),
    ]);
    expect(mandatoryGapWarning(rows)).toBeNull();
  });
});

describe("analysisSourceLabel", () => {
  it("без analysis — честно про недоступность", () => {
    expect(analysisSourceLabel()).toMatch(/недоступен/i);
    expect(analysisSourceLabel({})).toMatch(/недоступен/i);
  });

  it("с analysis — указывает автоматический разбор", () => {
    expect(analysisSourceLabel({ confirmedSkills: ["Python"] })).toMatch(/автоматический анализ/i);
  });
});

describe("PROCESSING_COPY", () => {
  it("фиксирует текст состояния обработки", () => {
    expect(PROCESSING_COPY).toBe("Интервью завершено, отчёт собирается");
  });
});
