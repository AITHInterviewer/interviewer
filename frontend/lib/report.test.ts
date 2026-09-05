import { describe, expect, it } from "vitest";

import type { InterviewAnswer, Question } from "@/lib/api";
import { buildRequirementMap, mandatorySummary, uncoveredRequirements } from "@/lib/report";

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
