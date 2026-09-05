import { describe, expect, it } from "vitest";

import {
  analysisSourceLabel,
  buildRequirementMap,
  isReportProcessing,
  mandatoryGapWarning,
  PROCESSING_COPY,
  requirementConclusion,
} from "@/lib/report";
import type { InterviewAnswer, Question } from "@/lib/api";

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

describe("candidate report scenarios", () => {
  const vacancy = {
    required_skills: ["Python", "Celery"],
    nice_to_have_skills: ["Docker"],
  };
  const questions = [
    question("q1", 1, ["Python"]),
    question("q2", 2, ["Celery"]),
    question("q3", 3, ["Docker"]),
  ];

  it("вопрос не задан — not-covered", () => {
    const rows = buildRequirementMap(
      { required_skills: ["Python", "Missing"], nice_to_have_skills: [] },
      [question("q1", 1, ["Python"])],
      [],
    );
    expect(rows.find((row) => row.skill === "Missing")?.coverage).toBe("not-covered");
  });

  it("ответ не получен — asked, не confirmed", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "текст")]);
    const celery = rows.find((row) => row.skill === "Celery");
    expect(celery?.coverage).toBe("asked");
    expect(requirementConclusion(celery!)).toBe("unavailable");
  });

  it("ответ есть без анализа — answered + unavailable", () => {
    const rows = buildRequirementMap(vacancy, questions, [answer("q1", "разбор event loop")]);
    const python = rows.find((row) => row.skill === "Python");
    expect(python?.coverage).toBe("answered");
    expect(requirementConclusion(python!)).toBe("unavailable");
    expect(analysisSourceLabel()).toMatch(/недоступен/i);
  });

  it("processing — без преждевременного пробела", () => {
    expect(isReportProcessing({ report_status: "processing" })).toBe(true);
    const rows = buildRequirementMap(vacancy, questions, []);
    expect(mandatoryGapWarning(rows)).toBeTruthy();
    expect(PROCESSING_COPY).toMatch(/отчёт собирается/i);
  });
});
