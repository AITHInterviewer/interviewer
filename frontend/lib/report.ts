import type {
  Interview,
  InterviewAnswer,
  InterviewReport,
  Question,
  QuestionDifficulty,
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

/** Требования, которые не закрывает ни один вопрос комплекта: дыра калибровки. */
export function uncoveredRequirements(rows: RequirementRow[]): RequirementRow[] {
  return rows.filter((row) => row.coverage === "not-covered");
}

/** Отчёт ещё собирается: цифры покрытия нельзя читать как итоговый пробел. */
export function isReportProcessing(interview: Pick<Interview, "product_state">): boolean {
  return interview.product_state === "report_processing";
}

/**
 * Якоря шкалы 1-5 (см. backend/app/prompts/evaluation_answer_score.txt) — короткие
 * подписи для интерфейса. «Как хорошо ответил» показываем этими словами, не голым числом.
 */
export const SCORE_ANCHOR: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "не раскрыл",
  2: "упустил важное",
  3: "ответил как ожидалось",
  4: "чуть глубже эталона",
  5: "глубокое понимание",
};

export const DIFFICULTY_LABEL: Record<QuestionDifficulty, string> = {
  baseline: "базовый вопрос",
  stretch: "вопрос со звёздочкой",
};

/** Разбор по навыку из report_json для строки требования. */
export function skillVerdictFor(report: InterviewReport | null | undefined, skill: string) {
  const needle = skill.trim().toLowerCase();
  return report?.skill_verdicts.find((row) => row.skill_tag.trim().toLowerCase() === needle) ?? null;
}

/**
 * Свод по обязательным навыкам: сколько подтверждено / требует проверки / не подтверждено.
 * Это и есть ответ на «насколько хорошо кандидат ответил», одной строкой.
 */
export function requiredSkillTally(report: InterviewReport | null | undefined): {
  pass: number;
  ambiguous: number;
  fail: number;
  untested: number;
  total: number;
} {
  const tally = { pass: 0, ambiguous: 0, fail: 0, untested: 0, total: 0 };
  for (const verdict of report?.skill_verdicts ?? []) {
    if (!verdict.required) continue;
    tally.total += 1;
    tally[verdict.skill_class] += 1;
  }
  return tally;
}
