import type { Vacancy } from "./types";

export const DEMO_VACANCY_ID = "python-middle";

export const vacancy: Vacancy = {
  id: DEMO_VACANCY_ID,
  title: "Middle+ Python Developer",
  grade: "Middle+",
  status: "Активна",
  rubricVersion: "v2",
  questionSetVersion: "v2",
  modelTag: "2026-08",
  expertName: "Алексей С.",
  managerName: "Игорь Матвеев",
  recruiterName: "Анна Ковалёва",
  recruiterEmail: "anna.kovaleva@napoleon-it.ru",
  updatedAt: "3 сентября 2026",
  counts: { invited: 1, inProgress: 1, processing: 1, reportReady: 3, decided: 1 },
  seniorModeDefault: false,
  languages: ["RU", "EN"],
  stack: ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
  realTasks: [
    "Разобрать очередь ночных задач и утечки соединений",
    "Поддержать API заказов и рейтинг внутри категории",
    "Закрыть мониторинг после инцидента на проде",
  ],
  stopFactors: ["Не может объяснить личную роль в задаче", "Не отличает симптом от причины"],
  clarifyWithManager: ["Celery обязателен в первый месяц или можно научить на месте?"],
};

export function getVacancy(id: string): Vacancy | undefined {
  if (id === vacancy.id) return vacancy;
  return undefined;
}

export function formatVacancyCounts(counts: Vacancy["counts"]): string {
  return `приглашены ${counts.invited} · проходят ${counts.inProgress} · обработка ${counts.processing} · отчёты ${counts.reportReady} · решено ${counts.decided}`;
}
