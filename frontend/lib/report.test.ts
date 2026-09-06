import { describe, expect, it } from "vitest";

import type { InterviewAnswer, InterviewReport, Question } from "@/lib/api";
import {
  buildRequirementMap,
  interviewScore,
  isReportProcessing,
  mandatorySummary,
  requiredSkillTally,
  requirementConclusion,
  scoreTone,
  skillVerdictFor,
  uncoveredRequirements,
  VERDICT_LABEL,
  verdictTone,
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

/** Прод-фикстура Софии Крыловой: старый report_json без skill_scores / confirmed_skills. */
const sofiaLegacyReport = {
  verdict: "needs_review" as const,
  summary: "Кандидат частично раскрыла стек, нужна доп. проверка.",
  strengths: "Уверенно говорит про компоненты и композицию.",
  weaknesses: "Путается в хуках и побочных эффектах.",
  per_question: [
    {
      question_id: "q-react",
      order: 1,
      score: 3,
      rationale: "оценка 3/5: описала компонент, без деталей хуков",
      skill_tag: ["React"],
      difficulty: "baseline",
      answered_with_hint: false,
    },
    {
      question_id: "q-ts",
      order: 2,
      score: 3,
      rationale: "оценка 3/5: базовый TypeScript",
      skill_tag: ["TypeScript"],
      difficulty: "baseline",
      answered_with_hint: false,
    },
  ],
  skill_verdicts: [
    {
      required: true,
      reasoning: ["Вопрос 1: оценка 3/5 — описала компонент, без деталей хуков"],
      skill_tag: "React",
      skill_class: "ambiguous" as const,
      mastery_level: 1,
      stretch_bonus: false,
      effective_score: 3,
    },
    {
      required: true,
      reasoning: ["Вопрос 2: оценка 3/5 — базовый TypeScript"],
      skill_tag: "TypeScript",
      skill_class: "pass" as const,
      mastery_level: 2,
      stretch_bonus: false,
      effective_score: 3,
    },
  ],
} as unknown as InterviewReport;

const sofiaQuestions = [
  { id: "q-react", order: 1 },
  { id: "q-ts", order: 2 },
];

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

  it("на legacy-отчёте Софии не бросает", () => {
    expect(() => requiredSkillTally(sofiaLegacyReport, ["React", "TypeScript", "Python"])).not.toThrow();
    expect(requiredSkillTally(sofiaLegacyReport, ["React", "TypeScript", "Python"])).toEqual({
      pass: 1,
      ambiguous: 1,
      fail: 0,
      untested: 1,
      total: 3,
    });
  });
});

describe("skillVerdictFor", () => {
  it("находит навык без учёта регистра и пробелов", () => {
    const data = report({ confirmed: ["Python"] });
    expect(skillVerdictFor(data, " python ")?.skill_class).toBe("pass");
    expect(skillVerdictFor(data, "Go")).toBeNull();
    expect(skillVerdictFor(null, "Python")).toBeNull();
  });

  it("не падает на старом report_json без skill_scores (София)", () => {
    expect(() => skillVerdictFor(sofiaLegacyReport, "React", sofiaQuestions)).not.toThrow();
    const react = skillVerdictFor(sofiaLegacyReport, "React", sofiaQuestions);
    expect(react?.skill_class).toBe("ambiguous");
    expect(react?.reasoning_lines).toEqual(sofiaLegacyReport.skill_verdicts?.[0]?.reasoning);
    expect(react?.best_score).toBe(1);
  });

  it("навык без записей в legacy-отчёте — null, не throw", () => {
    expect(() => skillVerdictFor(sofiaLegacyReport, "Go", sofiaQuestions)).not.toThrow();
    expect(skillVerdictFor(sofiaLegacyReport, "Go", sofiaQuestions)).toBeNull();
    expect(skillVerdictFor({} as InterviewReport, "React")).toBeNull();
  });

  it("отдаёт лучший уровень и обоснования в формате «Вопрос N (уровень/3)»", () => {
    const data = report({
      confirmed: ["Python"],
      skillScores: [
        { skill_tag: "Python", score: 2, rationale: "event loop" },
        { skill_tag: "Python", score: 3, rationale: "процесс-пул" },
      ],
    });
    const sv = skillVerdictFor(data, "Python", [{ id: "q1", order: 2 }]);
    expect(sv?.skill_class).toBe("pass");
    expect(sv?.best_score).toBe(3);
    expect(sv?.reasoning_lines).toEqual([
      "Вопрос 2 (2/3): event loop",
      "Вопрос 2 (3/3): процесс-пул",
    ]);
  });

  it("без списка вопросов обходится без номера", () => {
    const data = report({ skillScores: [{ skill_tag: "Python", score: 2, rationale: "ок" }] });
    expect(skillVerdictFor(data, "Python")?.reasoning_lines).toEqual(["2/3: ок"]);
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

describe("interviewScore", () => {
  it("отдаёт процент и вердикт готового отчёта", () => {
    const ready = {
      product_state: "report_ready" as const,
      report_json: { ...report({ confirmed: ["Python"] }), score_percent: 78, verdict: "fits" as const },
    };
    expect(interviewScore(ready)).toEqual({ percent: 78, verdict: "fits" });
  });

  it("null, пока отчёт собирается или отсутствует", () => {
    expect(interviewScore({ product_state: "report_processing", report_json: null })).toBeNull();
    expect(interviewScore({ product_state: "report_ready", report_json: null })).toBeNull();
    expect(interviewScore({})).toBeNull();
  });

  it("percent падает на overall_score, если score_percent нет", () => {
    const legacy = { product_state: "report_ready" as const, report_json: report({}) };
    expect(interviewScore(legacy)).toEqual({ percent: 92, verdict: "needs_review" });
  });

  it("на legacy-отчёте Софии не бросает", () => {
    const ready = { product_state: "report_ready" as const, report_json: sofiaLegacyReport };
    expect(() => interviewScore(ready)).not.toThrow();
    expect(interviewScore(ready)).toEqual({ percent: null, verdict: "needs_review" });
  });
});

describe("verdictTone / VERDICT_LABEL", () => {
  it("тон под вердикт", () => {
    expect(verdictTone("fits")).toBe("positive");
    expect(verdictTone("needs_review")).toBe("warning");
    expect(verdictTone("not_fits")).toBe("danger");
  });

  it("подписи на русском", () => {
    expect(VERDICT_LABEL.fits).toBe("Проходит");
    expect(VERDICT_LABEL.not_fits).toBe("Не проходит");
    expect(VERDICT_LABEL.needs_review).toBe("Нуждается в доп. проверке");
  });
});
