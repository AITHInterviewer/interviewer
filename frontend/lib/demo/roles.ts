import type { DemoRole, DemoRoleId } from "./types";

export const demoRoles: DemoRole[] = [
  {
    id: "recruiter",
    title: "Рекрутер",
    personName: "Анна Ковалёва",
    cardLine: "Вакансия, доска и отчёт Лидии",
    homePath: "/vacancies",
    onboarding: {
      who: "Вы Анна Ковалёва. В этом демо смотрите продукт глазами рекрутера.",
      willSee: "Список вакансий, затем доску Middle+ Python и отчёты.",
      firstAction: "Откройте вакансию Middle+ Python и карточку Лидии Орловой.",
      continueLabel: "Перейти к вакансиям",
      backLabel: "Назад к ролям",
    },
  },
  {
    id: "expert",
    title: "Эксперт",
    personName: "Алексей С.",
    cardLine: "Задачи, рубрика и комплект",
    homePath: "/expert",
    onboarding: {
      who: "Вы Алексей С. Калибровка в этом демо уже утверждена.",
      willSee: "Задачи: рубрика, комплект, аудит и утверждение.",
      firstAction: "Откройте карточку «Мои задачи» или рубрику с этой страницы.",
      continueLabel: "Открыть задачи",
      backLabel: "Назад к ролям",
    },
  },
  {
    id: "manager",
    title: "Менеджер",
    personName: "Игорь Матвеев",
    cardLine: "Одностраничник перед встречей с Лидией",
    homePath: "/manager/lida",
    onboarding: {
      who: "Вы Игорь Матвеев. Вам готовят встречу с кандидатом.",
      willSee: "Одностраничник Лидии без прокторинга.",
      firstAction: "Прочитайте блок «о чём поговорить».",
      continueLabel: "Открыть карточку Лидии",
      backLabel: "Назад к ролям",
    },
  },
  {
    id: "candidate-dmitry",
    title: "Кандидат",
    personName: "Дмитрий Козлов",
    cardLine: "Сильный сценарий, полный путь интервью",
    homePath: "/i/dmitry",
    onboarding: {
      who: "Вы Дмитрий Козлов, сильный кандидат в этом демо.",
      willSee: "Приглашение и шаги до отправки ответов.",
      firstAction: "Нажмите «Начать».",
      continueLabel: "Перейти к приглашению",
      backLabel: "Назад к ролям",
    },
  },
  {
    id: "candidate-nikita",
    title: "Кандидат",
    personName: "Никита Белов",
    cardLine: "Слабый сценарий, полный путь интервью",
    homePath: "/i/nikita",
    onboarding: {
      who: "Вы Никита Белов, слабый кандидат в этом демо.",
      willSee: "Тот же путь интервью. В отчёте будет «не соответствует».",
      firstAction: "Нажмите «Начать».",
      continueLabel: "Перейти к приглашению",
      backLabel: "Назад к ролям",
    },
  },
  {
    id: "candidate-lida",
    title: "Кандидат",
    personName: "Лидия Орлова",
    cardLine: "Серый сценарий: дыры в отчёте",
    homePath: "/i/lida",
    onboarding: {
      who: "Вы Лидия Орлова, неоднозначный кандидат — главный путь жюри.",
      willSee: "Тот же путь интервью. В отчёте будет «недостаточно данных».",
      firstAction: "Нажмите «Начать».",
      continueLabel: "Перейти к приглашению",
      backLabel: "Назад к ролям",
    },
  },
  {
    id: "admin",
    title: "Админ",
    personName: "Ольга Белова",
    cardLine: "Все вкладки сотрудников, включая пилот",
    homePath: "/vacancies",
    onboarding: {
      who: "Вы Ольга Белова. В этом демо у админа открыты все разделы сотрудников.",
      willSee: "Сайдбар со всеми вкладками: вакансии, эксперт, менеджер, бриф, пилот-экраны.",
      firstAction: "Откройте сайдбар и пройдите сиротские экраны: утверждение, аудит, бриф.",
      continueLabel: "Открыть все разделы",
      backLabel: "Назад к ролям",
    },
  },
];

export function getDemoRoleById(id: DemoRoleId): DemoRole | undefined {
  return demoRoles.find((role) => role.id === id);
}

export function roleCardLabel(role: DemoRole): string {
  return `${role.title} ${role.personName}`;
}
