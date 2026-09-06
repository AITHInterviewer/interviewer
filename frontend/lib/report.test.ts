import { describe, expect, it } from "vitest";

import type { InterviewAnswer, InterviewReport, Question } from "@/lib/api";
import {
  buildRequirementMap,
  isReportProcessing,
  mandatorySummary,
  requiredSkillTally,
  requirementConclusion,
  scoreTone,
  skillVerdictFor,
  uncoveredRequirements,
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

function report(args: {
  confirmed?: string[];
  unconfirmed?: string[];
  skillScores?: Array<{ skill_tag: string; score: number; rationale?: string }>;
}): InterviewReport {
  return {
    generated_at: "2026-09-06T10:00:00Z",
    model_version: "test/model",
    prompt_version: "v1",
    verdict: "needs_review",
    overall_score: 92,
    per_question: [
      {
        question_id: "q1",
        skill_scores: (args.skillScores ?? []).map((entry) => ({
          skill_tag: entry.skill_tag,
          score: entry.score,
          rationale: entry.rationale ?? "",
        })),
        quotes: [],
        confidence: 0.9,
        answered_with_hint: false,
        report: null,
      },
    ],
    confirmed_skills: args.confirmed ?? [],
    unconfirmed_skills: args.unconfirmed ?? [],
    contradictions_found: [],
    strengths: [],
    risks: [],
    summary_intro: null,
    summary_conclusion: null,
  };
}

describe("requiredSkillTally", () => {
  it("считает обязательные навыки по спискам confirmed/unconfirmed из отчёта", () => {
    const data = report({ confirmed: ["Python"], unconfirmed: ["Celery"] });
    expect(requiredSkillTally(data, ["Python", "SQL", "Celery"])).toEqual({
      pass: 1,
      ambiguous: 0,
      fail: 1,
      untested: 1,
      total: 3,
    });
  });

  it("навык с баллами, но без классификации — ambiguous", () => {
    const data = report({ skillScores: [{ skill_tag: "SQL", score: 55 }] });
    expect(requiredSkillTally(data, ["SQL"])).toEqual({ pass: 0, ambiguous: 1, fail: 0, untested: 0, total: 1 });
  });

  it("без отчёта — все не проверены", () => {
    expect(requiredSkillTally(null, ["Python"])).toEqual({ pass: 0, ambiguous: 0, fail: 0, untested: 1, total: 1 });
  });
});

describe("skillVerdictFor", () => {
  it("находит навык без учёта регистра и пробелов", () => {
    const data = report({ confirmed: ["Python"] });
    expect(skillVerdictFor(data, " python ")?.skill_class).toBe("pass");
    expect(skillVerdictFor(data, "Go")).toBeNull();
    expect(skillVerdictFor(null, "Python")).toBeNull();
  });

  it("отдаёт лучший балл и обоснования в формате «Вопрос N (score/100)»", () => {
    const data = report({
      confirmed: ["Python"],
      skillScores: [
        { skill_tag: "Python", score: 88, rationale: "event loop" },
        { skill_tag: "Python", score: 95, rationale: "процесс-пул" },
      ],
    });
    const sv = skillVerdictFor(data, "Python", [{ id: "q1", order: 2 }]);
    expect(sv?.skill_class).toBe("pass");
    expect(sv?.best_score).toBe(95);
    expect(sv?.reasoning_lines).toEqual([
      "Вопрос 2 (88/100): event loop",
      "Вопрос 2 (95/100): процесс-пул",
    ]);
  });

  it("без списка вопросов обходится без номера", () => {
    const data = report({ skillScores: [{ skill_tag: "Python", score: 70, rationale: "ок" }] });
    expect(skillVerdictFor(data, "Python")?.reasoning_lines).toEqual(["70/100: ок"]);
  });
});

describe("scoreTone", () => {
  it("пороги совпадают с verdict.py агента", () => {
    expect(scoreTone(39)).toBe("danger");
    expect(scoreTone(40)).toBe("warning");
    expect(scoreTone(69)).toBe("warning");
    expect(scoreTone(70)).toBe("positive");
  });
});

describe("isReportProcessing", () => {
  it("true при product_state report_processing", () => {
    expect(isReportProcessing({ product_state: "report_processing" })).toBe(true);
  });

  it("false когда отчёт не в обработке", () => {
    expect(isReportProcessing({ product_state: "report_ready" })).toBe(false);
    expect(isReportProcessing({})).toBe(false);
  });
});
