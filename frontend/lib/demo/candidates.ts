import type { Candidate, ReportRequirement } from "./types";
import { readStore } from "./recruiter-store";

function baseReport(): ReportRequirement[] {
  return [
    {
      requirementId: "async",
      status: "Подтверждено",
      aiSummary: "Объяснил причину утечки соединений и предложил контекстный менеджер.",
      whyStatus: "Названы причина, личное действие и способ закрытия ресурса.",
      quote: "Соединения к базе не закрывались в воркерах. Я добавил контекстный менеджер и ограничил размер пула.",
      quoteFoundInTranscript: true,
      timecode: "14:22",
      questionIndex: 3,
      followUpText: "Как вы убедились, что утечка не вернётся?",
      followUpAnswer: "Смотрели метрику открытых соединений в Grafana сутки после релиза.",
    },
    {
      requirementId: "sql",
      status: "Подтверждено",
      aiSummary: "Собрал корректный запрос с оконной функцией и объяснил выбор индекса.",
      whyStatus: "Есть оконная функция и индекс под фильтр.",
      quote: "Для рейтинга внутри категории использовал row_number, а индекс собрал по category_id и created_at.",
      quoteFoundInTranscript: true,
      timecode: "21:08",
      questionIndex: 5,
    },
    {
      requirementId: "ownership",
      status: "Подтверждено",
      aiSummary: "Роль в миграции описана конкретно, граница команды названа.",
      whyStatus: "Личная зона ответственности отделена от соседней команды.",
      quote: "Я отвечал за схему миграции и переключение трафика. Мониторинг настраивала соседняя команда.",
      quoteFoundInTranscript: true,
      timecode: "04:10",
      questionIndex: 1,
    },
    {
      requirementId: "incident",
      status: "Подтверждено",
      aiSummary: "Причина, исправление и проверка после фикса названы.",
      whyStatus: "Есть способ проверки результата.",
      quote: "Добавили контекстный менеджер, после этого смотрели алерты сутки.",
      quoteFoundInTranscript: true,
      timecode: "14:58",
      questionIndex: 4,
    },
    {
      requirementId: "celery",
      status: "Подтверждено",
      aiSummary: "Описал ретраи, идемпотентность и мониторинг очереди.",
      whyStatus: "Практический опыт с воркерами подтверждён.",
      quote: "Для ночных задач поставил ack_late и отдельную очередь с лимитом concurrency.",
      quoteFoundInTranscript: true,
      timecode: "18:02",
      questionIndex: 3,
    },
    {
      requirementId: "testing",
      status: "Подтверждено",
      aiSummary: "Разделяет модульные и интеграционные тесты, понимает границы моков.",
      whyStatus: "Есть уровни тестов и пример внешней зависимости.",
      quote: "Внешние API мы мокали на уровне клиента, а базу проверяли интеграционно на тестовом контейнере.",
      quoteFoundInTranscript: true,
      timecode: "24:31",
      questionIndex: 2,
    },
  ];
}

const dmitryReport = baseReport();

const nikitaReport: ReportRequirement[] = [
  {
    requirementId: "async",
    status: "Не подтверждено",
    aiSummary: "Критическая ошибка: предложил отключить event loop в проде как решение.",
    whyStatus: "Критическая ошибка из рубрики: опасное действие без локализации причины.",
    quote: "Если зависает, я просто перезапускаю процесс и отключаю asyncio.",
    quoteFoundInTranscript: true,
    timecode: "09:12",
    questionIndex: 3,
  },
    {
      requirementId: "sql",
      status: "Подтверждено",
      aiSummary: "Оконная функция названа, индекс выбран по фильтру.",
      whyStatus: "Есть row_number и составной индекс.",
      quote: "Для рейтинга внутри категории использовал row_number и индекс по category_id.",
      quoteFoundInTranscript: true,
      timecode: "16:40",
      questionIndex: 5,
    },
  {
    requirementId: "ownership",
    status: "Частично",
    aiSummary: "Роль описана общими словами «мы сделали».",
    whyStatus: "Граница личной ответственности не названа.",
    quote: "Мы вместе подняли миграцию, я тоже участвовал.",
    quoteFoundInTranscript: true,
    timecode: "03:20",
    questionIndex: 1,
  },
  {
    requirementId: "incident",
    status: "Частично",
    aiSummary: "Симптом назван, проверка после фикса отсутствует.",
    whyStatus: "Признак сильного ответа «способ проверки» не назван.",
    quote: "Сервис падал ночью, мы перезапустили и стало лучше.",
    quoteFoundInTranscript: true,
    timecode: "11:05",
    questionIndex: 4,
  },
  {
    requirementId: "celery",
    status: "Не проверено",
    aiSummary: "Обязательное требование не встретилось в ответах.",
    whyStatus: "Вопрос по Celery в комплекте не покрыт.",
    quote: "",
    quoteFoundInTranscript: false,
    timecode: null,
    questionIndex: null,
    insufficientReason: "рубрика не покрывает вариант",
  },
    {
      requirementId: "testing",
      status: "Подтверждено",
      aiSummary: "Разделяет модульные и интеграционные тесты.",
      whyStatus: "Есть уровни тестов, несмотря на слабый остальной профиль.",
      quote: "Модульно мокаем клиент API, базу проверяем контейнером.",
      quoteFoundInTranscript: true,
      timecode: "07:44",
      questionIndex: 2,
    },
];

const lidaReport: ReportRequirement[] = [
  {
    requirementId: "async",
    status: "Подтверждено",
    aiSummary: "Объяснила утечку соединений и контекстный менеджер.",
    whyStatus: "Причина и действие названы.",
    quote: "Соединения к базе не закрывались в воркерах. Я добавила контекстный менеджер.",
    quoteFoundInTranscript: true,
    timecode: "14:22",
    questionIndex: 3,
    followUpText: "Как вы убедились, что утечка не вернётся?",
    followUpAnswer: "skipped",
  },
  {
    requirementId: "sql",
    status: "Подтверждено",
    aiSummary: "Оконная функция и индекс описаны корректно.",
    whyStatus: "Есть row_number и составной индекс.",
    quote: "Для рейтинга внутри категории использовала row_number и индекс по category_id.",
    quoteFoundInTranscript: true,
    timecode: "21:08",
    questionIndex: 5,
  },
    {
      requirementId: "ownership",
      status: "Подтверждено",
      aiSummary: "Роль в миграции описана, граница команды названа.",
      whyStatus: "Личная зона отделена от соседней команды.",
      quote: "Я отвечала за схему миграции и переключение трафика. Мониторинг настраивала соседняя команда.",
      quoteFoundInTranscript: true,
      timecode: "04:10",
      questionIndex: 1,
      followUpText: "Где заканчивалась ваша ответственность?",
      followUpAnswer: "Мониторинг настраивала соседняя команда, но детали я не контролировала.",
    },
  {
    requirementId: "incident",
    status: "Недостаточно данных",
    aiSummary: "Причина и исправление названы. Способ проверки после исправления не подтверждён источником.",
    whyStatus: "Признак сильного ответа «способ проверки результата» не подтверждён транскриптом.",
    quote: "После фикса мы смотрели дашборд и убедились, что метрика стабильна.",
    quoteFoundInTranscript: false,
    timecode: null,
    questionIndex: 4,
    insufficientReason: "цитата не найдена в транскрипте",
  },
  {
    requirementId: "celery",
    status: "Не проверено",
    aiSummary: "Обязательное требование не встретилось в основных вопросах и ответах кандидата.",
    whyStatus: "Вопрос не задавался.",
    quote: "",
    quoteFoundInTranscript: false,
    timecode: null,
    questionIndex: null,
    insufficientReason: "вопрос не задавался",
  },
  {
    requirementId: "testing",
    status: "Подтверждено",
    aiSummary: "Разделяет модульные и интеграционные тесты.",
    whyStatus: "Есть пример моков и тестового контейнера.",
    quote: "Внешние API мокали на уровне клиента, базу проверяли интеграционно.",
    quoteFoundInTranscript: true,
    timecode: "24:31",
    questionIndex: 2,
  },
];

export const candidates: Candidate[] = [
  {
    id: "dmitry",
    token: "dmitry",
    name: "Дмитрий Козлов",
    email: "dmitry.kozlov@example.com",
    persona: "strong",
    interviewState: "Отчёт готов",
    deadline: "8 сентября",
    locale: "ru",
    seniorMode: false,
    textOnly: false,
    currentQuestion: 5,
    systemRecommendation: "Соответствует",
    mandatoryCovered: { confirmed: dmitryReport.filter((item) => item.status === "Подтверждено").length, total: 6 },
    durationMin: 28,
    submittedAt: "2 сентября 2026",
    strengths: ["Асинхронность", "SQL", "Тестирование"],
    risks: ["Практику Celery можно углубить на встрече"],
    unchecked: [],
    report: dmitryReport,
    proctoringEvents: [],
  },
  {
    id: "nikita",
    token: "nikita",
    name: "Никита Белов",
    email: "nikita.belov@example.com",
    persona: "weak",
    interviewState: "Отчёт готов",
    deadline: "8 сентября",
    locale: "ru",
    seniorMode: false,
    textOnly: false,
    currentQuestion: 5,
    systemRecommendation: "Не соответствует",
    mandatoryCovered: { confirmed: nikitaReport.filter((item) => item.status === "Подтверждено").length, total: 6 },
    durationMin: 22,
    submittedAt: "1 сентября 2026",
    strengths: ["Готов говорить о симптомах"],
    risks: ["Критическая ошибка в асинхронности", "Нет проверки после инцидента"],
    unchecked: ["Celery"],
    report: nikitaReport,
    proctoringEvents: [],
    criticalError: "Предложил отключить asyncio в проде без локализации причины",
  },
  {
    id: "lida",
    token: "lida",
    name: "Лидия Орлова",
    email: "lida.orlova@example.com",
    persona: "ambiguous",
    interviewState: "Отчёт готов",
    deadline: "8 сентября",
    locale: "ru",
    seniorMode: false,
    textOnly: false,
    currentQuestion: 5,
    systemRecommendation: "Недостаточно данных",
    mandatoryCovered: { confirmed: lidaReport.filter((item) => item.status === "Подтверждено").length, total: 6 },
    durationMin: 26,
    submittedAt: "3 сентября 2026",
    strengths: ["Асинхронность", "SQL", "Тестирование", "Личный вклад"],
    risks: ["Способ проверки после инцидента не подтверждён источником", "Celery не проверялся"],
    unchecked: ["Celery"],
    report: lidaReport,
    proctoringEvents: [{ type: "переключение вкладки", at: "12:40", durationSec: 18 }],
  },
];

export function inviteTokenFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
  return slug || "candidate";
}

function invitedStub(token: string, name: string, email: string): Candidate {
  return {
    id: token,
    token,
    name,
    email,
    persona: "ambiguous",
    interviewState: "Приглашён",
    deadline: "8 сентября",
    locale: "ru",
    seniorMode: false,
    textOnly: false,
    currentQuestion: 1,
    systemRecommendation: "Недостаточно данных",
    mandatoryCovered: { confirmed: 0, total: 6 },
    durationMin: 0,
    submittedAt: "",
    strengths: [],
    risks: [],
    unchecked: [],
    report: [],
    proctoringEvents: [],
  };
}

export function getCandidateByToken(token: string): Candidate | undefined {
  const existing = candidates.find((item) => item.token === token);
  if (existing) return existing;
  if (typeof window === "undefined") return undefined;
  const invited = readStore().invited.find((item) => item.id === token);
  if (!invited) return undefined;
  return invitedStub(invited.id, invited.name, invited.email);
}

export function getCandidateById(id: string): Candidate | undefined {
  return candidates.find((item) => item.id === id) ?? getCandidateByToken(id);
}
