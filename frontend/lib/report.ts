import type { InterviewAnswer, Question, VacancyDetail } from "@/lib/api";

/**
 * Как требование закрыто ответами. Система не выносит вердикт: она показывает,
 * задавали ли вопрос и ответил ли человек. Решение принимает рекрутер.
 */
export type RequirementCoverage = "answered" | "asked" | "not-covered";

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
  asked: "Вопрос задан, ответа нет",
  "not-covered": "Вопрос не задавался",
};

function questionsForSkill(questions: Question[], skill: string): Question[] {
  const needle = skill.trim().toLowerCase();
  return questions
    .filter((question) => (question.skill_tag ?? []).some((tag) => tag.trim().toLowerCase() === needle))
    .sort((a, b) => a.order - b.order);
}

/**
 * Карта требований: требование вакансии, вопросы комплекта, которые его
 * закрывают, и ответы кандидата на них. Ничего не додумывает: если вопроса
 * нет, так и пишет.
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

/** Сколько обязательных требований закрыто ответом. */
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
