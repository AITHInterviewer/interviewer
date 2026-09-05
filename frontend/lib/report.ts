import type { Interview, InterviewAnswer, Question, VacancyDetail } from "@/lib/api";

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

/** Обязательные требования без ответа с расшифровкой — пробел для решения человека. */
export function mandatoryGapRows(rows: RequirementRow[]): RequirementRow[] {
  return rows.filter((row) => row.mandatory && row.coverage !== "answered");
}

/** Желательные пробелы — отдельно от обязательных, не считаются провалом. */
export function optionalGapRows(rows: RequirementRow[]): RequirementRow[] {
  return rows.filter((row) => !row.mandatory && row.coverage !== "answered");
}

/** Честная подпись источника разбора: без analysis — явно «недоступен». */
export function analysisSourceLabel(analysis?: unknown): string {
  if (explicitConfirmedSkills(analysis) != null) {
    return "Источник разбора: автоматический анализ ответов.";
  }
  return "Источник разбора: анализ ответов пока недоступен — вывод по навыку не сформирован.";
}

/** Предупреждение по обязательному пробелу. null — если предупреждать не о чём. */
export function mandatoryGapWarning(rows: RequirementRow[]): string | null {
  const gaps = mandatoryGapRows(rows);
  if (gaps.length === 0) {
    return null;
  }
  const skills = gaps.map((row) => `«${row.skill}»`).join(", ");
  return `По требованию ${skills} ответ не получен. Можно задать доп. вопрос или запросить аудит.`;
}

/** Отчёт ещё собирается: цифры покрытия нельзя читать как итоговый пробел. */
export function isReportProcessing(
  interview: Pick<Interview, "report_status" | "product_state">,
): boolean {
  return interview.report_status === "processing" || interview.product_state === "report_processing";
}

export const PROCESSING_COPY = "Интервью завершено, отчёт собирается";
