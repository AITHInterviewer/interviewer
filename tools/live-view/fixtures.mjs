/** Ответы бэкенда для съёмки экранов без сервера. Данные русские и по канону. */
const user = {
  id: "u-anna",
  name: "Анна Ковалёва",
  email: "anna@napoleon-it.ru",
  roles: ["recruiter", "expert", "hiring_manager", "admin"],
};

const vacancies = [
  {
    id: "v-python",
    recruiter_id: "u-anna",
    title: "Middle+ Python Developer",
    description: "Платформа заказов: async, SQL, Celery, тестирование.",
    grade: "Middle+",
    required_skills: ["Python", "SQL", "async"],
    nice_to_have_skills: ["Docker"],
    status: "active",
    created_at: "2026-09-01T10:00:00Z",
    candidate_count: 7,
  },
  {
    id: "v-go",
    recruiter_id: "u-anna",
    title: "Senior Go Developer",
    description: "Разделение монолита на сервисы.",
    grade: "Senior",
    required_skills: ["Go", "gRPC"],
    nice_to_have_skills: ["Kubernetes"],
    status: "calibration",
    created_at: "2026-09-03T10:00:00Z",
    owner_next: "expert",
    candidate_count: 0,
  },
  {
    id: "v-qa",
    recruiter_id: "u-anna",
    title: "QA Automation",
    description: "Регресс перед релизом.",
    grade: "Middle",
    required_skills: ["Python", "Playwright"],
    nice_to_have_skills: [],
    status: "draft",
    created_at: "2026-08-28T10:00:00Z",
    candidate_count: 0,
  },
];

const questions = [
  {
    id: "q1",
    vacancy_id: "v-python",
    order: 1,
    text: "Расскажите о проекте, где вы отвечали за миграцию или крупное изменение. Что было вашей зоной, а что делала команда?",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    source: "base_generated",
    skill_tag: ["Личный вклад"],
    time_limit_sec: 240,
  },
  {
    id: "q2",
    vacancy_id: "v-python",
    order: 2,
    text: "Разберите инцидент на проде: как поняли причину, что сделали сами и как проверили, что исправление сработало?",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    source: "base_generated",
    skill_tag: ["Разбор инцидента"],
    time_limit_sec: 240,
  },
];

const interviews = [
  {
    id: "i-lida",
    vacancy_id: "v-python",
    candidate_name: "Лидия Орлова",
    resume_file_url: "",
    access_token: "lida",
    status: "report_ready",
    created_at: "2026-09-03T09:00:00Z",
    product_state: "report_ready",
    report_status: "ready",
    recruiter_decision: "awaiting",
  },
  {
    id: "i-dmitry",
    vacancy_id: "v-python",
    candidate_name: "Дмитрий Козлов",
    resume_file_url: "",
    access_token: "dmitry",
    status: "report_ready",
    created_at: "2026-09-02T09:00:00Z",
    product_state: "report_ready",
    report_status: "ready",
    recruiter_decision: "handed_off",
  },
  {
    id: "i-pavel",
    vacancy_id: "v-python",
    candidate_name: "Павел Юрьев",
    resume_file_url: "",
    access_token: "pavel",
    status: "in_interview",
    created_at: "2026-09-05T09:00:00Z",
    product_state: "in_interview",
    recruiter_decision: "awaiting",
  },
];

export const fixtures = {
  user,
  vacancies,
  questions,
  interviews,
  landing: {
    roles: user.roles,
    default_path: "/vacancies",
    available_areas: [
      { id: "area.recruiter_workspace", label: "Вакансии", path: "/vacancies" },
      { id: "area.expert_questions", label: "Эксперт", path: "/expert" },
      { id: "area.hiring_manager_review", label: "Встречи", path: "/manager" },
    ],
    available_actions: ["action.internal_users.manage"],
  },
};

/** Подбирает ответ под путь запроса. */
export function respond(pathname) {
  const p = pathname.replace(/\?.*$/, "");
  // Кандидатский маршрут: /api/interview/:token
  if (/^\/api\/interview\/[^/]+$/.test(p)) {
    // PW_STATE позволяет снять кандидатские шаги после согласия и после сдачи.
    const state = process.env.PW_STATE ?? "opened";
    return {
      interview_id: "i-lida",
      status: state === "submitted" ? "completed" : "in_progress",
      vacancy_title: "Middle+ Python Developer",
      questions_total: 5,
      estimated_duration_min: { min: 20, max: 25 },
      product_state: state,
      consented: state !== "opened",
    };
  }
  if (/^\/api\/interview\/[^/]+\/(consent|progress)$/.test(p)) return { product_state: "consented" };
  if (/^\/api\/interview\/[^/]+\/extra\/[^/]+$/.test(p))
    return { id: "c1", status: "open", extra_token: "extra-lida" };
  if (p.endsWith("/auth/me")) return fixtures.user;
  if (p.endsWith("/internal-users/me/landing")) return fixtures.landing;
  if (p.endsWith("/internal-users")) return { items: [fixtures.user] };
  if (p.endsWith("/internal/roles"))
    return {
      items: [
        { code: "recruiter", title: "Рекрутер", sort_order: 1 },
        { code: "expert", title: "Технический эксперт", sort_order: 2 },
        { code: "hiring_manager", title: "Нанимающий менеджер", sort_order: 3 },
      ],
    };
  if (p.endsWith("/expert/queue"))
    return {
      calibrations: [fixtures.vacancies[1]],
      audits: [{ interview: fixtures.interviews[0], vacancy_id: "v-python", vacancy_title: "Middle+ Python Developer" }],
    };
  if (p.endsWith("/manager/candidates"))
    return {
      items: [
        {
          interview: fixtures.interviews[0],
          vacancy_title: "Middle+ Python Developer",
          handed_off_at: "2026-09-05T08:00:00Z",
          from_recruiter_name: "Анна Ковалёва",
          summary: "Разбор инцидента раскрыт частично.",
          access: "handoff",
        },
      ],
    };
  if (/\/manager\/candidates\/[^/]+$/.test(p))
    return {
      interview: fixtures.interviews[0],
      vacancy_title: "Middle+ Python Developer",
      handed_off_at: "2026-09-05T08:00:00Z",
      from_recruiter_name: "Анна Ковалёва",
      summary: "Разбор инцидента раскрыт частично.",
      access: "handoff",
    };
  if (p.endsWith("/staff/hiring-managers")) return { items: [{ id: "u-igor", name: "Игорь Матвеев", email: "igor@napoleon-it.ru" }] };
  if (p.endsWith("/vacancies")) return { items: fixtures.vacancies };
  if (/\/vacancies\/[^/]+\/interviews$/.test(p)) return { items: fixtures.interviews };
  if (/\/vacancies\/[^/]+\/questions$/.test(p)) return fixtures.questions;
  if (/\/vacancies\/[^/]+\/rubric-versions$/.test(p))
    return {
      items: [
        {
          id: "rv2",
          vacancy_id: "v-python",
          version_number: 2,
          approved_at: "2026-09-03T10:00:00Z",
          snapshot: { required_skills: ["Python", "SQL", "async", "Разбор инцидента"] },
        },
        {
          id: "rv1",
          vacancy_id: "v-python",
          version_number: 1,
          approved_at: "2026-08-20T10:00:00Z",
          snapshot: { required_skills: ["Python", "SQL"] },
        },
      ],
    };
  if (/\/vacancies\/[^/]+\/anonymized-stats$/.test(p))
    return { invited: 7, completed: 4, awaiting_decision: 3 };
  if (/\/vacancies\/[^/]+$/.test(p)) return { ...fixtures.vacancies[0], questions: fixtures.questions };
  if (/\/interviews\/[^/]+\/events$/.test(p))
    return {
      interview: fixtures.interviews[0],
      events: [],
      answers: [
        {
          id: "a1",
          interview_id: "i-lida",
          question_id: "q2",
          question_text: "Разберите инцидент на проде: как поняли причину и как проверили, что исправление сработало?",
          transcript_text: "Соединения к базе не закрывались в воркерах. Добавила контекстный менеджер.",
          created_at: "2026-09-03T09:20:00Z",
        },
      ],
    };
  if (/\/interviews\/[^/]+\/clarifications$/.test(p)) return { items: [] };
  if (/\/interviews\/[^/]+$/.test(p)) return fixtures.interviews[0];
  return {};
}
