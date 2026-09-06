/** Ответы бэкенда для съёмки экранов без сервера. Данные русские и по канону. */
const user = {
  id: "u-anna",
  name: "Анна Ковалёва",
  email: "anna@napoleon-it.ru",
  roles: ["recruiter", "expert", "hiring_manager"],
};

const vacancies = [
  {
    id: "v-python",
    recruiter_id: "u-anna",
    title: "Middle+ Python Developer",
    description: "Платформа заказов: async, SQL, Celery, тестирование.",
    grade: "Middle+",
    required_skills: [
      "Асинхронность",
      "SQL и индексы",
      "Celery и очереди",
      "Тестирование",
      "Разбор инцидента",
    ],
    nice_to_have_skills: ["Code review", "Docker"],
    requirements: [
      { id: "req_0", name: "Асинхронность", kind: "must", level: "expert", evidence: "Опыт работы с asyncio от 3 лет", source: "llm" },
      { id: "req_1", name: "SQL и индексы", kind: "must", level: "expert", evidence: "PostgreSQL — оптимизация запросов", source: "llm" },
      { id: "req_2", name: "Celery и очереди", kind: "must", level: "confident", evidence: "Фоновые задачи и очереди", source: "llm" },
      { id: "req_3", name: "Тестирование", kind: "must", level: "confident", evidence: "Покрытие тестами сервисов", source: "llm" },
      { id: "req_4", name: "Разбор инцидента", kind: "must", level: "confident", evidence: "Дежурства и разбор инцидентов", source: "llm" },
      { id: "req_5", name: "Docker", kind: "nice", level: "basic", evidence: "Будет плюсом: Docker", source: "llm" },
    ],
    description_source: "pdf",
    description_file_name: "python-middle-plus.pdf",
    status: "active",
    created_at: "2026-09-01T10:00:00Z",
    candidate_count: 3,
  },
  {
    id: "v-go",
    recruiter_id: "u-anna",
    title: "Senior Go Developer",
    description: "Разделение монолита на сервисы.",
    grade: "Senior",
    required_skills: ["Go", "gRPC"],
    nice_to_have_skills: ["Kubernetes"],
    requirements: [
      { id: "req_0", name: "Go", kind: "must", level: "expert", evidence: "Go — от 5 лет коммерческой разработки", source: "llm" },
      { id: "req_1", name: "gRPC", kind: "must", level: "confident", evidence: "gRPC для межсервисного взаимодействия", source: "llm" },
      { id: "req_2", name: "Микросервисы", kind: "must", level: "confident", evidence: "Разделение монолита на сервисы", source: "llm" },
      { id: "req_3", name: "Kubernetes", kind: "nice", level: "basic", evidence: "Будет плюсом: Kubernetes", source: "llm" },
    ],
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
    requirements: [
      { id: "req_0", name: "Python", kind: "must", level: "confident", evidence: "Автотесты на Python", source: "llm" },
      { id: "req_1", name: "Playwright", kind: "must", level: "confident", evidence: "Playwright — e2e-сценарии", source: "llm" },
    ],
    status: "draft",
    created_at: "2026-08-28T10:00:00Z",
    candidate_count: 0,
  },
];

const questions = [
  {
    id: "q1",
    vacancy_id: "v-python",
    interview_id: null,
    order: 1,
    text: "Расскажите про задачу, где асинхронность реально что-то дала. Что было узким местом и как вы это поняли?",
    skill_tag: ["Асинхронность"],
    intent: "Отличает ли CPU-bound от IO-bound на своём опыте",
    reference_answer: "Называет конкретное узкое место, объясняет, почему помог именно asyncio, и как измерил результат.",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimated_duration_sec: 240,
    stimulus: null,
    source: "base_generated",
  },
  {
    id: "q2",
    vacancy_id: "v-python",
    interview_id: null,
    order: 2,
    text: "Запрос по заказам стал медленным. Как выясняете причину и что делаете с индексами?",
    skill_tag: ["SQL и индексы"],
    intent: "Читает ли план запроса или подбирает индексы наугад",
    reference_answer: "Смотрит план запроса, объясняет порядок колонок в составном индексе, помнит про селективность.",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimated_duration_sec: 240,
    stimulus: null,
    source: "base_generated",
  },
  {
    id: "q3",
    vacancy_id: "v-python",
    interview_id: null,
    order: 3,
    text: "Как у вас устроены фоновые задачи: что уходит в очередь, что происходит при падении воркера?",
    skill_tag: ["Celery и очереди"],
    intent: "Понимает ли повторные попытки и идемпотентность",
    reference_answer: "Разделяет очереди по критичности, называет ретраи и защиту от двойной обработки.",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimated_duration_sec: 240,
    stimulus: null,
    source: "base_generated",
  },
  {
    id: "q4",
    vacancy_id: "v-python",
    interview_id: null,
    order: 4,
    text: "Что покрываете тестами в первую очередь и как решаете, что мокать?",
    skill_tag: ["Тестирование"],
    intent: "Есть ли своя логика выбора уровня теста",
    reference_answer: "Мокает внешние границы, а не свой код, и объясняет, почему.",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimated_duration_sec: 240,
    stimulus: null,
    source: "base_generated",
  },
  {
    id: "q5",
    vacancy_id: "v-python",
    interview_id: null,
    order: 5,
    text: "Разберите инцидент на проде: как поняли причину, что сделали сами и как проверили, что исправление сработало?",
    skill_tag: ["Разбор инцидента"],
    intent: "Отличает симптом от причины и проверяет результат",
    reference_answer: "Называет причину, личный вклад и способ проверки после фикса.",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimated_duration_sec: 240,
    stimulus: null,
    source: "base_generated",
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
    // У этого пользователя роль эксперта — значит и право править вопросы/калибровать.
    available_actions: ["action.internal_users.manage", "action.questions.edit"],
  },
};

/** Один снимок: на доске Дмитрий уже передан, Лидия ещё ждёт решения рекрутера. */
function dmitryHandoff() {
  const interview = fixtures.interviews.find((item) => item.id === "i-dmitry");
  if (!interview) {
    throw new Error("fixtures.mjs: нет интервью i-dmitry — карточку менеджера собирать не из чего");
  }
  return {
    interview,
    vacancy_title: "Middle+ Python Developer",
    handed_off_at: "2026-09-04T12:00:00Z",
    from_recruiter_name: "Анна Ковалёва",
    summary: "Нужна вторая пара глаз по SQL.",
    access: "handoff",
  };
}

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
      deadline: "2026-09-12T18:00:00Z",
    };
  }
  if (/^\/api\/interview\/[^/]+\/(consent|progress)$/.test(p)) return { product_state: "consented" };
  if (/^\/api\/interview\/[^/]+\/extra\/[^/]+$/.test(p))
    return { id: "c1", status: "open", extra_token: "extra-lida" };
  if (p.endsWith("/vacancies/extract-requirements"))
    return {
      title: "Python Developer",
      grade: "middle_plus",
      description: "Middle + Python Developer\nТребования: Python от 5 лет, Apache Kafka, PostgreSQL…",
      description_file_name: null,
      requirements: fixtures.vacancies[0].requirements,
      excluded: [
        { text: "Удалённая работа, гибкое начало дня", reason: "условия работы" },
        { text: "Оплата участия в конференциях", reason: "условия работы" },
        { text: "Зарплата не указана", reason: "не проверяется на интервью" },
      ],
      warnings: ["В заголовке Middle+, а Python требуется от 5 лет — обычно это Senior"],
    };
  if (p.endsWith("/auth/me")) return fixtures.user;
  if (p.endsWith("/internal-users/me/landing")) return fixtures.landing;
  if (p.endsWith("/internal-users"))
    return {
      items: [
        fixtures.user,
        { id: "u-igor", name: "Игорь Матвеев", email: "igor@napoleon-it.ru", roles: ["hiring_manager"], created_by_user_id: "u-anna" },
        { id: "u-elena", name: "Елена Сорокина", email: "elena@napoleon-it.ru", roles: ["expert"], created_by_user_id: "u-anna" },
      ],
    };
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
      audits: [
        {
          interview: fixtures.interviews[0],
          vacancy_id: "v-python",
          vacancy_title: "Middle+ Python Developer",
          requirement: "Разбор инцидента",
          reason: "Рекрутер просит взгляд: в отчёте требование раскрыто частично.",
        },
      ],
    };
  if (p.endsWith("/manager/candidates"))
    return {
      items: [dmitryHandoff()],
    };
  if (/\/manager\/candidates\/[^/]+$/.test(p)) {
    const id = p.split("/").pop();
    if (id === "i-dmitry") return dmitryHandoff();
    return {};
  }
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
    return { invited: 3, completed: 1, awaiting_decision: 1 };
  if (/\/vacancies\/[^/]+$/.test(p)) {
    // Отдаём именно ту вакансию, чей id в пути — иначе экран калибровки снимался бы
    // на активной вакансии и всегда выглядел зафиксированным.
    const id = p.split("/").pop();
    const found = fixtures.vacancies.find((item) => item.id === id) ?? fixtures.vacancies[0];
    return { ...found, questions: found.id === "v-python" ? fixtures.questions : [] };
  }
  if (/\/interviews\/[^/]+\/events$/.test(p)) {
    const id = p.split("/").slice(-2)[0];
    const interview = fixtures.interviews.find((item) => item.id === id);
    if (id === "i-dmitry") {
      return {
        interview: interview ?? fixtures.interviews[1],
        events: [],
        answers: [
          {
            id: "a-d2",
            question_id: "q2",
            question_text: "Запрос по заказам стал медленным.",
            transcript_text:
              "Смотрю фильтр и составной индекс по user_id и дате. Время до и после сравниваю чаще, чем план запроса.",
          },
        ],
      };
    }
    if (id !== "i-lida") {
      return { interview: interview ?? fixtures.interviews[0], events: [], answers: [] };
    }
    return {
      interview: fixtures.interviews[0],
      events: [
        { id: "e1", interview_id: "i-lida", event_type: "invited", created_at: "2026-09-03T08:40:00Z", payload: {} },
        { id: "e2", interview_id: "i-lida", event_type: "consent_given", created_at: "2026-09-03T09:02:00Z", payload: { audio: true, video: false } },
        { id: "e3", interview_id: "i-lida", event_type: "interview_started", created_at: "2026-09-03T09:05:00Z", payload: {} },
        { id: "e4", interview_id: "i-lida", event_type: "answer_submitted", created_at: "2026-09-03T09:11:00Z", payload: { question: 1 } },
        { id: "e5", interview_id: "i-lida", event_type: "interview_submitted", created_at: "2026-09-03T09:31:00Z", payload: {} },
        { id: "e6", interview_id: "i-lida", event_type: "report_ready", created_at: "2026-09-03T10:24:00Z", payload: {} },
      ],
      answers: [
        {
          id: "a1",
          question_id: "q1",
          question_text: "Расскажите про задачу, где асинхронность реально что-то дала.",
          transcript_text:
            "Мы разбирали, почему сервис заказов упирается в задержки. Оказалось, что почти всё время он ждал внешние вызовы, а не считал. Перевела клиента на asyncio, собрала запросы пачками, задержка на пике упала примерно втрое. Проверяла по времени ответа и по количеству ожидающих корутин.",
        },
        {
          id: "a2",
          question_id: "q2",
          question_text: "Запрос по заказам стал медленным.",
          transcript_text:
            "Смотрю, какие поля в фильтре, и добавляю составной индекс по user_id и дате, порядок важен. План запроса я честно смотрю редко, обычно сравниваю время до и после.",
        },
        {
          id: "a4",
          question_id: "q4",
          question_text: "Что покрываете тестами в первую очередь?",
          transcript_text:
            "Сначала то, что ломается чаще: расчёты и границы с внешними сервисами. Мокаю только чужое, свой код стараюсь не мокать, иначе тест проверяет мок.",
        },
        {
          id: "a5",
          question_id: "q5",
          question_text: "Разберите инцидент на проде.",
          transcript_text:
            "Соединения к базе не закрывались в воркерах, пул кончался под нагрузкой. Добавила контекстный менеджер и лимит на воркер. После выката смотрела число активных соединений сутки, оно перестало расти.",
        },
      ],
    };
  }
  if (/\/interviews\/[^/]+\/clarifications$/.test(p)) {
    const id = p.split("/").slice(-2)[0];
    if (id !== "i-lida") return { items: [] };
    return {
      items: [
        {
          id: "cl-audit",
          interview_id: "i-lida",
          type: "expert_audit",
          status: "open",
          close_reason: null,
          extra_token: null,
        },
      ],
    };
  }
  if (/\/interviews\/[^/]+$/.test(p)) {
    const id = p.split("/").pop();
    return fixtures.interviews.find((item) => item.id === id) ?? {};
  }
  return {};
}
