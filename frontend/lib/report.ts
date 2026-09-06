import type {
  Interview,
  InterviewAnswer,
  InterviewReport,
  PerQuestionReport,
  Question,
  QuestionDifficulty,
  SkillClass,
  VacancyDetail,
} from "@/lib/api";

/**
 * Наличие ответа по требованию — это сбор данных, не вердикт по навыку.
 * «answered» значит: вопрос задан и расшифровка непустая. Это не «подтверждено».
 */
export type RequirementCoverage = "answered" | "asked" | "not-covered";

/**
 * Итог разбора навыка. Отдельно от покрытия.
 * Без явного payload анализа (его нет в API) всегда «unavailable».
 */
export type RequirementConclusion = "confirmed" | "insufficient" | "unavailable";

export type RequirementRow = {
  skill: string;
  mandatory: boolean;
  coverage: RequirementCoverage;
  /** Вопросы комплекта, которые закрывают это требование. */
  questions: Question[];
  /** Ответы кандидата на эти вопросы, в порядке вопросов. */
  answers: Array<{ question: Question; answer: InterviewAnswer }>;
};

export const COVERAGE_LABEL: Record<RequirementCoverage, string> = {
  answered: "Ответ есть",
  asked: "Ответа нет",
  "not-covered": "Вопрос не задан",
};

export const CONCLUSION_LABEL: Record<RequirementConclusion, string> = {
  confirmed: "Подтверждено",
  insufficient: "Мало данных",
  unavailable: "Разбор недоступен",
};

/**
 * Будущий явный разбор. Поля не читаем с Interview: `report_json` на фронте нет.
 * Страница карточки кандидата сейчас analysis не передаёт.
 */
export type RequirementAnalysis = {
  confirmedSkills?: string[];
};

function questionsForSkill(questions: Question[], skill: string): Question[] {
  const needle = skill.trim().toLowerCase();
  return questions
    .filter((question) => (question.skill_tag ?? []).some((tag) => tag.trim().toLowerCase() === needle))
    .sort((a, b) => a.order - b.order);
}

/**
 * Карта требований: требование вакансии, вопросы комплекта и ответы.
 * Наличие расшифровки ≠ подтверждение навыка.
 */
export function buildRequirementMap(
  vacancy: Pick<VacancyDetail, "required_skills" | "nice_to_have_skills">,
  questions: Question[],
  answers: InterviewAnswer[],
): RequirementRow[] {
  const byQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));

  const rows = (mandatory: boolean) => (skill: string): RequirementRow => {
    const matched = questionsForSkill(questions, skill);
    const withAnswers = matched
      .map((question) => ({ question, answer: byQuestion.get(question.id) }))
      .filter((pair): pair is { question: Question; answer: InterviewAnswer } =>
        Boolean(pair.answer?.transcript_text),
      );
    const coverage: RequirementCoverage =
      matched.length === 0 ? "not-covered" : withAnswers.length > 0 ? "answered" : "asked";
    return { skill, mandatory, coverage, questions: matched, answers: withAnswers };
  };

  return [
    ...vacancy.required_skills.map(rows(true)),
    ...vacancy.nice_to_have_skills.map(rows(false)),
  ];
}

function explicitConfirmedSkills(analysis: unknown): string[] | null {
  if (analysis == null || typeof analysis !== "object" || Array.isArray(analysis)) {
    return null;
  }
  const skills = (analysis as RequirementAnalysis).confirmedSkills;
  if (!Array.isArray(skills)) {
    return null;
  }
  if (!skills.every((item) => typeof item === "string")) {
    return null;
  }
  return skills;
}

/**
 * Вывод по навыку. Никогда не ставит «confirmed» из тега и расшифровки.
 * Без явного analysis — всегда «unavailable». Страница analysis не передаёт.
 */
export function requirementConclusion(
  row: Pick<RequirementRow, "skill">,
  analysis?: unknown,
): RequirementConclusion {
  const confirmedSkills = explicitConfirmedSkills(analysis);
  if (confirmedSkills == null) {
    return "unavailable";
  }
  const needle = row.skill.trim().toLowerCase();
  if (confirmedSkills.some((skill) => skill.trim().toLowerCase() === needle)) {
    return "confirmed";
  }
  return "insufficient";
}

/** Сколько обязательных требований закрыто ответом. Это не подтверждение навыка. */
export function mandatorySummary(rows: RequirementRow[]): { answered: number; total: number } {
  const mandatory = rows.filter((row) => row.mandatory);
  return {
    answered: mandatory.filter((row) => row.coverage === "answered").length,
    total: mandatory.length,
  };
}

/** Фиксированная шкала вакансии: она не меняется от качества ответов кандидата. */
export function vacancyScoreRange(vacancy: Pick<VacancyDetail, "required_skills" | "nice_to_have_skills">, questionCount: number) {
  const maximum = questionCount * 3 + vacancy.required_skills.length * 2 + vacancy.nice_to_have_skills.length * 0.5;
  return { minimum: 0, maximum, threshold: maximum * 0.6 };
}

/** Требования, которые не закрывает ни один вопрос комплекта: дыра калибровки. */
export function uncoveredRequirements(rows: RequirementRow[]): RequirementRow[] {
  return rows.filter((row) => row.coverage === "not-covered");
}

/** Отчёт ещё собирается: цифры покрытия нельзя читать как итоговый пробел. */
export function isReportProcessing(interview: Pick<Interview, "product_state">): boolean {
  return interview.product_state === "report_processing";
}

export type ReportVerdict = "fits" | "not_fits" | "needs_review";

export const VERDICT_LABEL: Record<ReportVerdict, string> = {
  fits: "Проходит",
  not_fits: "Не проходит",
  needs_review: "Нуждается в доп. проверке",
};

export function verdictTone(verdict: ReportVerdict): "positive" | "warning" | "danger" {
  if (verdict === "fits") return "positive";
  if (verdict === "not_fits") return "danger";
  return "warning";
}

/**
 * Готовая оценка для списков кандидатов: не-null только когда отчёт собран.
 * До этого момента оценки не существует — показывать нельзя.
 */
export function interviewScore(interview: Pick<Interview, "product_state" | "report_json">): {
  percent: number | null;
  verdict: ReportVerdict | null;
} | null {
  if (isReportProcessing(interview)) return null;
  const report = interview.report_json;
  if (!report) return null;
  return {
    percent: report.score_percent ?? report.overall_score ?? null,
    verdict: report.verdict ?? null,
  };
}

/**
 * Тон чипа балла 0-100 из отчёта агента: <40 — не подтверждён, <70 — требует
 * проверки, иначе подтверждён (пороги совпадают с verdict.py evaluation-agent).
 */
export function scoreTone(score: number): "positive" | "warning" | "danger" {
  if (score < 40) return "danger";
  if (score < 70) return "warning";
  return "positive";
}

export const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = {
  baseline: "базовый вопрос",
  stretch: "вопрос со звёздочкой",
};

function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

type SkillScoreRow = { question_id: string; score: number; rationale: string };

function formatScoreReasoning(entries: SkillScoreRow[], orderById: Map<string, number>): string[] {
  return entries.map((entry) => {
    const order = orderById.get(entry.question_id);
    const prefix = order != null ? `Вопрос ${order} (${entry.score}/3)` : `${entry.score}/3`;
    return entry.rationale ? `${prefix}: ${entry.rationale}` : prefix;
  });
}

const CLASSIFIED: ReadonlySet<string> = new Set(["pass", "fail", "ambiguous"]);

/**
 * Разбор навыка из report_json агента. Partial/legacy JSON не бросает.
 * Класс: confirmed/unconfirmed_skills, иначе skill_verdicts[].skill_class.
 * Уровни и обоснования — из skill_scores (0–3); если их нет, из skill_verdicts
 * (reasoning + mastery_level). Старую 5-балльную score в 0–3 не переводим.
 * null — навыка нет в отчёте (страница показывает тогда пилюлю покрытия).
 */
export function skillVerdictFor(
  report: InterviewReport | null | undefined,
  skill: string,
  questions?: Pick<Question, "id" | "order">[],
): {
  skill_class: SkillClass;
  best_score: number | null;
  reasoning_lines: string[];
} | null {
  if (!report || typeof report !== "object") return null;
  const needle = normalizeSkill(skill);
  const orderById = new Map((questions ?? []).map((question) => [question.id, question.order]));
  const realEntries: SkillScoreRow[] = [];
  const legacyEntries: SkillScoreRow[] = [];

  for (const row of asArray<PerQuestionReport>(report.per_question)) {
    if (!row || typeof row !== "object") continue;
    const questionId = typeof row.question_id === "string" ? row.question_id : "";
    if (Array.isArray(row.skill_scores)) {
      for (const entry of row.skill_scores) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.skill_tag !== "string" || normalizeSkill(entry.skill_tag) !== needle) continue;
        if (typeof entry.score !== "number") continue;
        realEntries.push({
          question_id: questionId,
          score: entry.score,
          rationale: typeof entry.rationale === "string" ? entry.rationale : "",
        });
      }
      continue;
    }
    if (typeof row.score !== "number") continue;
    const rationale = typeof row.rationale === "string" ? row.rationale : "";
    for (const tag of asArray<string>(row.skill_tag)) {
      if (typeof tag !== "string" || normalizeSkill(tag) !== needle) continue;
      legacyEntries.push({ question_id: questionId, score: row.score, rationale });
    }
  }

  const confirmed = asArray<string>(report.confirmed_skills).some(
    (item) => typeof item === "string" && normalizeSkill(item) === needle,
  );
  const unconfirmed = asArray<string>(report.unconfirmed_skills).some(
    (item) => typeof item === "string" && normalizeSkill(item) === needle,
  );
  const verdict = asArray<NonNullable<InterviewReport["skill_verdicts"]>[number]>(report.skill_verdicts).find(
    (item) =>
      item != null &&
      typeof item === "object" &&
      typeof item.skill_tag === "string" &&
      normalizeSkill(item.skill_tag) === needle,
  );

  if (!confirmed && !unconfirmed && !verdict && realEntries.length === 0 && legacyEntries.length === 0) {
    return null;
  }

  let skill_class: SkillClass;
  if (confirmed) {
    skill_class = "pass";
  } else if (unconfirmed) {
    skill_class = "fail";
  } else if (verdict && CLASSIFIED.has(verdict.skill_class)) {
    skill_class = verdict.skill_class as "pass" | "fail" | "ambiguous";
  } else if (realEntries.length > 0 || legacyEntries.length > 0) {
    skill_class = "ambiguous";
  } else {
    return null;
  }

  let reasoning_lines: string[];
  if (realEntries.length > 0) {
    reasoning_lines = formatScoreReasoning(realEntries, orderById);
  } else {
    const fromVerdict = asArray<string>(verdict?.reasoning).filter((line) => typeof line === "string");
    reasoning_lines = fromVerdict.length > 0 ? fromVerdict : formatScoreReasoning(legacyEntries, orderById);
  }

  const best_score =
    realEntries.length > 0
      ? Math.max(...realEntries.map((entry) => entry.score))
      : typeof verdict?.mastery_level === "number"
        ? verdict.mastery_level
        : null;

  return { skill_class, best_score, reasoning_lines };
}

/**
 * Свод по обязательным навыкам: сколько подтверждено / требует проверки / не подтверждено.
 * Это и есть ответ на «насколько хорошо кандидат ответил», одной строкой.
 */
export function requiredSkillTally(
  report: InterviewReport | null | undefined,
  requiredSkills: string[],
): {
  pass: number;
  ambiguous: number;
  fail: number;
  untested: number;
  total: number;
} {
  const tally = { pass: 0, ambiguous: 0, fail: 0, untested: 0, total: 0 };
  for (const skill of requiredSkills) {
    tally.total += 1;
    tally[skillVerdictFor(report, skill)?.skill_class ?? "untested"] += 1;
  }
  return tally;
}
