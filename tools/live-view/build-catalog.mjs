/**
 * Съёмка всех экранов и сборка docs/ui-review/screens.html + screens.pdf.
 * Нужен запущенный фронт: cd frontend && npm run dev
 *   node build-catalog.mjs
 */
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fixtures, respond } from "./fixtures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "docs", "ui-review");
const shotDir = join(outDir, "screens");
const base = process.env.PW_BASE ?? "http://localhost:3000";
const session = { access_token: "demo-token", token_type: "bearer", user: fixtures.user };

/** @typedef {{ id: string, path: string, name: string, caption: string, fix?: { kind: "done"|"todo", text: string }, anon?: boolean, state?: string, after?: string }} Shot */

/** @type {{ title: string, lead: string, shots: Shot[] }[]} */
const sections = [
  {
    title: "Вход и служебные",
    lead: "Что человек видит до кабинета.",
    shots: [
      {
        id: "login",
        path: "/login",
        name: "Вход",
        anon: true,
        caption: "Логотип, карточка, русские подписи. В основном ряду только «Войти» — регистрации там нет. Ссылка «Нужна помощь со входом?». Текст про выданные доступы, не про администратора.",
        fix: { kind: "done", text: "Помощь со входом видна сразу, не только после ошибки." },
      },
      {
        id: "login-error",
        path: "/login",
        name: "Ошибка входа",
        anon: true,
        after: "login-error",
        caption: "После 401 фронт показывает «Не удалось войти. Проверьте почту и пароль», а не текст бэкенда. Мок отдаёт английское «Invalid email or password.» — на экране его нет.",
        fix: { kind: "done", text: "after: login-error по-прежнему заполняет форму и нажимает «Войти»." },
      },
      {
        id: "register",
        path: "/register",
        name: "Регистрация",
        anon: true,
        caption: "Тот же кадр карточки. Заголовок честный: регистрация рекрутера, не «первый аккаунт».",
        fix: { kind: "done", text: "Заголовок «Регистрация рекрутера» — экран открывают и когда аккаунты уже есть." },
      },
      {
        id: "notfound",
        path: "/no-such-page",
        name: "Такой страницы нет",
        anon: true,
        caption: "404 с логотипом и путём назад ко входу.",
      },
    ],
  },
  {
    title: "Рекрутер",
    lead: "Список, доска, отчёт, настройки.",
    shots: [
      {
        id: "vacancies",
        path: "/vacancies",
        name: "Список вакансий",
        caption: "Статус пилюлей, следующий шаг — действие и кто делает (например «Рекрутер: работа с кандидатами»), поиск, фильтр и сортировка. Пустой результат отличает «вакансий нет» от «под фильтры ничего не подошло».",
        fix: { kind: "done", text: "Поиск по названию, фильтр по статусу, сортировка." },
      },
      {
        id: "new",
        path: "/vacancies/new",
        name: "Новая вакансия",
        caption: "Форма без лишних полей. Сначала создаём вакансию и собираем вопросы, затем можно отправить эксперту. Письмо само не уходит.",
        fix: { kind: "done", text: "Под кнопкой сказано: письмо эксперту не отправляем." },
      },
      {
        id: "board",
        path: "/vacancies/v-python",
        name: "Доска кандидатов",
        caption: "Колонки по вниманию рекрутера. Лидия — готовы к решению, Дмитрий — завершён / передан, Павел — в интервью. Пустая «приглашены» в настоящем времени: «Сейчас в этой стадии никого нет», потому что люди уже есть дальше. Пауза — глагол «Приостановить».",
        fix: { kind: "done", text: "Пустая колонка не говорит «никого не пригласили», если на доске уже есть люди." },
      },
      {
        id: "report",
        path: "/vacancies/v-python/candidates/i-lida",
        name: "Отчёт по кандидату",
        caption: "Сводка и карта требований. «Ответ есть» — расшифровка есть, это не подтверждение навыка. «Разбор недоступен» — анализа в ответе интервью нет.",
        fix: {
          kind: "todo",
          text: "Нет таймкодов и плеера: API их не отдаёт. Как появятся — цитата станет кликабельной.",
        },
      },
      {
        id: "settings",
        path: "/vacancies/v-python/settings",
        name: "Настройки",
        caption: "Сверху «Статус вакансии»: статус, «Приостановить» и «Архивировать». Ниже поля названия и навыков.",
        fix: { kind: "done", text: "Пауза и архив вынесены из формы. Архив спрашивает подтверждение в модалке." },
      },
      {
        id: "settings-archive",
        path: "/vacancies/v-python/settings",
        name: "Подтверждение архива",
        after: "archive-modal",
        caption: "Модалка держит фокус, закрывается по Esc. Написано, что случится со ссылками кандидатов.",
        fix: { kind: "done", text: "Кнопка называется «Архивировать». Съёмка жмёт её, не «Архив»." },
      },
    ],
  },
  {
    title: "Калибровка",
    lead: "Три шага одной задачи: критерии, вопросы, утверждение.",
    shots: [
      {
        id: "rubric",
        path: "/vacancies/v-python/rubric",
        name: "Требования",
        caption: "Список навыков можно поправить здесь же, как в настройках. Видно, какой вопрос закрывает требование и где дыра.",
        fix: { kind: "done", text: "Форма навыков дергает тот же updateVacancy — прыжок в настройки не нужен." },
      },
      {
        id: "questions",
        path: "/vacancies/v-python/questions",
        name: "Вопросы",
        caption: "Роль, формат и сложность словами. Вопрос подписан требованием, которое закрывает. Тег вне требований помечен.",
        fix: { kind: "done", text: "Вопрос с тегом вне требований: ответ на него ничего не закроет." },
      },
      {
        id: "approve",
        path: "/vacancies/v-python/approve",
        name: "Утверждение",
        caption: "Вакансия Python уже active: это просмотр уже утверждённого комплекта, не экран «сейчас утверждаем». Пустой комплект и «уже одобрено» — другие состояния.",
        fix: {
          kind: "todo",
          text: "Когда действие доступно, нет сравнения версий: что меняется в v3 против v2. Это считает сервер.",
        },
      },
    ],
  },
  {
    title: "Эксперт",
    lead: "Очередь задач и разбор отчёта.",
    shots: [
      {
        id: "expert",
        path: "/expert",
        name: "Кабинет эксперта",
        caption: "Сверху вакансии на калибровке с грейдом и числом требований, ниже отчёты на аудит.",
      },
      {
        id: "expert-queue",
        path: "/expert/queue",
        name: "Очередь аудитов",
        caption: "Отдельный список убран: маршрут сразу открывает кабинет эксперта, чтобы не плодить второй такой же экран.",
        fix: { kind: "done", text: "/expert/queue — редирект на /expert. Старые ссылки не ломаются." },
      },
      {
        id: "audit",
        path: "/audit/v-python",
        name: "Список аудитов",
        caption: "Имя кандидата, требование и причина запроса. Если очередь поля не прислала — честный пробел и «откройте карточку».",
        fix: { kind: "done", text: "Строка говорит, что именно проверить, без подстановки чужих навыков." },
      },
      {
        id: "audit-card",
        path: "/audit/v-python/i-lida",
        name: "Карточка аудита",
        caption: "Кто и о чём попросил, ответы цитатами. Эксперт отвечает здесь: данных хватает или нужен доп. вопрос.",
        fix: { kind: "done", text: "«Данных хватает» закрывает запрос, «нужен доп. вопрос» заказывает уточнение." },
      },
    ],
  },
  {
    title: "Нанимающий менеджер",
    lead: "Список встреч и одностраничник перед разговором.",
    shots: [
      {
        id: "manager",
        path: "/manager",
        name: "Встречи",
        caption: "Заголовок «Встречи и запросы мнения». Есть дата передачи. В этом снимке один человек: Дмитрий, доступ handoff. Запрос мнения (opinion) — другой тип доступа, в этот момент его нет.",
        fix: { kind: "done", text: "Лидия на доске ещё ждёт решения рекрутера — в списке менеджера её нет." },
      },
      {
        id: "manager-card",
        path: "/manager/i-dmitry",
        name: "Карточка к встрече",
        caption: "Карточка Дмитрия: вакансия, кто передал и зачем, ответы, возврат к списку. Кнопок «берём / нет» нет.",
        fix: {
          kind: "todo",
          text: "Исход встречи записать некуда: в API нет ручки. Кнопки «берём / нет» без сохранения не рисуем.",
        },
      },
      {
        id: "brief",
        path: "/brief/v-python",
        name: "Бриф",
        caption: "Обезличенная сводка и сами обязательные навыки, которые формулировал менеджер.",
        fix: { kind: "done", text: "Кроме цифр «приглашено / прошли / ждут» виден список требований." },
      },
    ],
  },
  {
    title: "Пользователи",
    lead: "Доступы сотрудников. Это право сессии, не роль администратора.",
    shots: [
      {
        id: "users",
        path: "/internal/users",
        name: "Сотрудники",
        caption: "Роли recruiter, expert, hiring_manager — роли admin нет. Страница открывается по праву action.internal_users.manage. Заголовок «Пользователи».",
        fix: { kind: "done", text: "Управление списком — право сессии, не роль «администратор»." },
      },
    ],
  },
  {
    title: "Кандидат",
    lead: "Шаги от приглашения до расшифровки. Оценку и решение кандидат не видит.",
    shots: [
      {
        id: "invite",
        path: "/i/lida",
        name: "Приглашение",
        anon: true,
        state: "opened",
        caption: "Сколько вопросов, сколько займёт, до какой даты действует ссылка.",
        fix: { kind: "done", text: "Срок из приглашения. Если даты нет — честно: смотрите письмо или напишите рекрутеру." },
      },
      {
        id: "consent",
        path: "/i/lida/consent",
        name: "Согласие на запись",
        anon: true,
        state: "opened",
        caption: "Продолжить нельзя без отметки, причина рядом.",
      },
      {
        id: "check",
        path: "/i/lida/check",
        name: "Проверка перед стартом",
        anon: true,
        state: "consented",
        caption: "Для голоса нужен микрофон, камера не обязательна. Кнопка «Проверить микрофон» — настоящая проверка, не декорация.",
      },
      {
        id: "rules",
        path: "/i/lida/rules",
        name: "Правила",
        anon: true,
        state: "device_checked",
        caption: "Как устроены вопросы и что происходит с ответами.",
      },
      {
        id: "practice",
        path: "/i/lida/practice",
        name: "Разминка",
        anon: true,
        state: "ready",
        caption: "Не записывается и не идёт в отчёт — сказано в первой строке.",
      },
      {
        id: "resume",
        path: "/i/lida/resume",
        name: "Возврат",
        anon: true,
        state: "interrupted",
        caption: "Можно продолжить с того же места. Согласие уже есть — дальше чеклист или разговор.",
      },
      {
        id: "live",
        path: "/i/lida/live",
        name: "Комната интервью",
        anon: true,
        state: "in_interview",
        caption: "Микрофон обязателен, камера нет. Этот кадр — экран проверки устройств до входа в комнату: без выданного разрешения браузера живой LiveKit-звонок здесь не снять.",
      },
      {
        id: "done",
        path: "/i/lida/done",
        name: "Готово",
        anon: true,
        state: "submitted",
        caption: "Ответы приняты, рекрутер свяжется сам. Кнопки «Написать рекрутеру» нет. Срок приглашения здесь не выдаётся за дату ответа рекрутера.",
        fix: { kind: "done", text: "На «готово» нет обещания написать рекрутеру и нет чужой даты ответа." },
      },
      {
        id: "transcript",
        path: "/i/lida/transcript",
        name: "Расшифровка",
        anon: true,
        state: "submitted",
        caption: "Свои ответы. Оценки нет. Пустое состояние честное, если расшифровка ещё не пришла.",
      },
      {
        id: "request",
        path: "/i/lida/request",
        name: "Черновик заметки",
        anon: true,
        state: "submitted",
        caption: "«Черновик заметки». Текст только в этом браузере — рекрутер его не получит.",
        fix: { kind: "done", text: "Кнопка называется «Сохранить заметку»." },
      },
      {
        id: "extra",
        path: "/i/lida/extra/c1",
        name: "Доп. вопрос",
        anon: true,
        state: "submitted",
        caption: "Текст вопроса в этой ссылке недоступен. Срок доп. ответа из extra GET не приходит — срок приглашения сюда не подставляем.",
        fix: {
          kind: "todo",
          text: "В extra GET только id, status и extra_token. Текста вопроса и срока нет — это блокер контракта, не фронта.",
        },
      },
      {
        id: "expired",
        path: "/i/expired",
        name: "Ссылка не работает",
        anon: true,
        caption: "Ссылка не работает. Нет «К выбору роли» и нет степпера — только что случилось и попросить новую ссылку у рекрутера.",
      },
    ],
  },
];

const allShots = sections.flatMap((section) => section.shots);

/** Блокеры контракта. Не пишем поля так, будто они уже есть в ответе. Восстановление сессии уже идёт через product_state — сюда не входит. */
const backendBlockers = [
  {
    title: "Текст и срок доп. вопроса.",
    text: "Ответ extra отдаёт id, status и extra_token. Текста вопроса и отдельного срока в этом ответе нет. Фронт не подставляет срок приглашения.",
  },
  {
    title: "Разбор по требованиям.",
    text: "На клиентском типе Interview нет разбора по требованиям. Фронт не подставляет фальшивый разбор.",
  },
  {
    title: "Срок приглашения на живом бэкенде.",
    text: "Срок часто отсутствует в ответе приглашения. Мок для экрана приглашения его отдаёт. Экран extra этот срок не наследует.",
  },
  {
    title: "Слепок версии рубрики в отчёте.",
    text: "Слепок версии в API есть, экран отчёта его не использует как разбор навыков.",
  },
  {
    title: "Исход встречи у менеджера.",
    text: "Нужна ручка записи исхода. Место на карточке есть, писать некуда. Кнопки «берём / нет» без сохранения не рисуем.",
  },
  {
    title: "Таймкоды и запись.",
    text: "Цитаты в отчёте станут кликабельными, когда в ответе появятся время начала и ссылка на запись. До этого плеер рисовать нечем.",
  },
  {
    title: "Сравнение версий рубрики.",
    text: "На утверждении нужен diff двух версий. Слепок требований в версии уже есть, сравнивать две версии должен сервер.",
  },
];

async function shotPage(page, item) {
  process.env.PW_STATE = item.state ?? "opened";
  if (item.anon) {
    await page.evaluate(() => window.localStorage.removeItem("ainterviewer-auth"));
  } else {
    await page.evaluate((s) => window.localStorage.setItem("ainterviewer-auth", JSON.stringify(s)), session);
  }

  page._catalogFailLogin = item.after === "login-error";

  await page.goto(base + item.path, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1200);

  if (item.after === "login-error") {
    await page.locator('input[type="email"]').fill("anna@napoleon-it.ru");
    await page.locator('input[type="password"]').fill("WrongPass1");
    await page.getByRole("button", { name: /^войти$/i }).click();
    await page.waitForTimeout(800);
  }
  if (item.after === "archive-modal") {
    const archive = page.getByRole("button", { name: /архивировать/i });
    if (await archive.count()) {
      await archive.click();
      await page.waitForTimeout(500);
    }
  }

  const file = join(shotDir, `${item.id}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 62, fullPage: false });
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 180);
  return text;
}

function htmlDocument(shotNotes) {
  const total = allShots.length;
  const done = allShots.filter((s) => s.fix?.kind === "done").length;
  const todo = allShots.filter((s) => s.fix?.kind === "todo").length;
  const sectionsHtml = sections
    .map((section) => {
      const figures = section.shots
        .map((item) => {
          const fix = item.fix
            ? `<p class="fix" data-kind="${item.fix.kind}"><b>${item.fix.kind === "done" ? "Сделано" : "Осталось"}:</b> ${esc(item.fix.text)}</p>`
            : "";
          return `<figure>
        <div class="left"><span class="name">${esc(item.name)}</span><span class="route">${esc(item.path)}</span></div>
        <img src="screens/${item.id}.jpg" alt="${esc(item.name)}" loading="lazy" width="1440" height="900">
        <figcaption>${esc(item.caption)}</figcaption>
        ${fix}
      </figure>`;
        })
        .join("\n");
      return `<section>
    <div class="sec-head">
      <div><h2>${esc(section.title)}</h2><p>${esc(section.lead)}</p></div>
      <span class="count">${section.shots.length}</span>
    </div>
    <div class="grid">
      ${figures}
    </div>
  </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Экраны Napoleon Interview</title>
<style>
  :root {
    --canvas:#f2f2f5; --surface:#fdfdff; --ink:#1c1c20;
    --ink-secondary:#555560; --ink-tertiary:#757580; --border:#d5d5dd; --accent:#140af0;
    --warning:#80530a; --warning-soft:#fff1cc; --positive:#126544;
    --sans:"Helvetica Neue",Helvetica,Arial,sans-serif;
    --mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--canvas); color:var(--ink); font-family:var(--sans); font-size:16px; line-height:1.5; -webkit-font-smoothing:antialiased; }
  .wrap { width:min(100% - 40px, 1180px); margin:0 auto; padding:40px 0 96px; }
  .word { font-size:12px; font-weight:600; letter-spacing:.14em; }
  .word span { font-family:var(--mono); font-size:14px; letter-spacing:0; color:var(--accent); }
  h1 { margin:16px 0 10px; font-size:34px; font-weight:600; line-height:1.15; letter-spacing:-.01em; text-wrap:balance; }
  .lede { max-width:68ch; margin:0; color:var(--ink-secondary); }
  .meta { display:flex; flex-wrap:wrap; gap:8px 18px; margin-top:18px; color:var(--ink-tertiary); font-size:14px; }
  .meta b { color:var(--ink); font-weight:600; }
  section { margin-top:56px; }
  .sec-head { display:flex; align-items:baseline; justify-content:space-between; gap:20px; padding-bottom:14px; border-bottom:1px solid var(--border); }
  h2 { margin:0; font-size:18px; font-weight:600; line-height:1.3; }
  .sec-head p { max-width:58ch; margin:0; color:var(--ink-tertiary); font-size:14px; }
  .count { flex:0 0 auto; color:var(--ink-tertiary); font-family:var(--mono); font-size:14px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(430px,1fr)); gap:26px; margin-top:22px; }
  figure { display:flex; flex-direction:column; gap:10px; margin:0; }
  .left { display:flex; align-items:baseline; gap:10px; justify-content:space-between; }
  .name { font-size:16px; font-weight:600; }
  .route { color:var(--ink-tertiary); font-family:var(--mono); font-size:14px; overflow-wrap:anywhere; }
  figure img { display:block; width:100%; height:auto; border:1px solid var(--border); border-radius:8px; background:var(--surface); }
  figcaption { color:var(--ink-secondary); font-size:14px; }
  .fix { margin:0; padding:8px 10px; border-left:2px solid var(--warning); background:var(--warning-soft); color:var(--warning); font-size:14px; }
  .fix[data-kind="done"] { border-left-color:var(--positive); background:transparent; color:var(--ink-secondary); }
  .fix[data-kind="done"] b { color:var(--positive); }
  .fix b { font-weight:600; }
  a { color:var(--accent); }
  .howto { margin-top:26px; padding:22px 24px; border:1px solid var(--border); border-radius:12px; background:var(--surface); }
  .howto h3 { margin:0 0 12px; font-size:16px; font-weight:600; }
  .howto ol { margin:0; padding-left:20px; display:flex; flex-direction:column; gap:12px; }
  .howto li { color:var(--ink-secondary); }
  .howto li b { color:var(--ink); font-weight:600; }
  .howto p { margin:0; color:var(--ink-secondary); max-width:70ch; }
  .howto code { font-family:var(--mono); font-size:14px; color:var(--ink); }
  @media print {
    body { background:#fff; }
    .wrap { width:auto; margin:0; padding:0; }
    .grid { grid-template-columns:1fr; }
    figure { break-inside:avoid; page-break-inside:avoid; }
    section { break-before:page; }
    section:first-of-type { break-before:auto; }
    h1, .lede, .meta { break-after:avoid; }
  }
</style>
</head>
<body>
<div class="wrap">
  <span class="word">NAPOLEON <span>[INTERVIEW]</span></span>
  <h1>Все экраны Napoleon Interview</h1>
  <p class="lede">Каталог на коде ветки <code style="font-family:var(--mono);font-size:14px">main</code>, 6 сентября 2026.
  Один снимок на все роли: вакансия Middle+ Python Developer, пять требований, пять вопросов.
  Лидия ждёт решения рекрутера, Дмитрий уже передан менеджеру, Павел в интервью.
  Зелёным — уже сделано на фронте. Жёлтым — то, что без бэкенда не закрыть.</p>
  <div class="meta">
    <span><b>${total}</b> экранов</span>
    <span><b>${done}</b> закрытых правок на кадрах</span>
    <span><b>${todo}</b> ждут бэкенд</span>
    <span>мок без живого API</span>
  </div>
  ${sectionsHtml}
  <section>
    <div class="sec-head">
      <div><h2>Что ещё нельзя закрыть с фронта</h2><p>Эти задачи упираются в контракт API. Интерфейс под них не рисует фальшивый успех.</p></div>
      <span class="count">${backendBlockers.length}</span>
    </div>
    <div class="howto">
      <h3>Упирается в бэкенд</h3>
      <ol>
        ${backendBlockers
          .map((item) => `<li><b>${esc(item.title)}</b> ${esc(item.text)}</li>`)
          .join("\n        ")}
      </ol>
    </div>
  </section>
</div>
</body>
</html>
`;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

await mkdir(shotDir, { recursive: true });

const dir = await mkdtemp(join(tmpdir(), "pw-cat-"));
const ctx = await chromium.launchPersistentContext(dir, {
  headless: true,
  channel: "chrome",
  viewport: { width: 1440, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(12000);

await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  if (page._catalogFailLogin && url.pathname.includes("/auth/login") && route.request().method() === "POST") {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Invalid email or password." }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(respond(url.pathname)),
  });
});

await page.goto(base + "/login", { waitUntil: "domcontentloaded" });

const notes = [];
for (const item of allShots) {
  try {
    const text = await shotPage(page, item);
    console.log(`ok  ${item.id.padEnd(20)} ${item.path}  ${text.slice(0, 90)}`);
    notes.push({ id: item.id, ok: true, text });
  } catch (error) {
    console.log(`FAIL ${item.id} ${item.path}  ${error.message.slice(0, 160)}`);
    notes.push({ id: item.id, ok: false, text: error.message });
  }
}

const html = htmlDocument(notes);
const htmlPath = join(outDir, "screens.html");
await writeFile(htmlPath, html);

const pdfPage = await ctx.newPage();
await pdfPage.goto(`file://${htmlPath}`, { waitUntil: "load", timeout: 30000 });
await pdfPage.waitForTimeout(800);
await pdfPage.pdf({
  path: join(outDir, "screens.pdf"),
  format: "A4",
  printBackground: true,
  margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
});

await ctx.close();
await rm(dir, { recursive: true, force: true });
console.log(`\nHTML ${htmlPath}`);
console.log(`PDF  ${join(outDir, "screens.pdf")}`);
console.log(`кадры ${shotDir} (${allShots.length})`);
