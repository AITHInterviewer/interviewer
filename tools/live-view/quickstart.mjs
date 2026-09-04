import {
  clickLoginCard,
  detectBase,
  gotoPath,
  installHardTimeout,
  openBrowser,
  pageDigest,
  shot,
  withStep,
} from "./lib.mjs";

const NAMES = ["Анна Ковалёва", "Алексей С.", "Игорь Матвеев", "Дмитрий Козлов", "Никита Белов", "Лидия Орлова"];

const hardTimer = installHardTimeout();
const base = await detectBase();
console.log(`base=${base} headed=${process.env.PW_HEADED === "1" ? "yes" : "no"}`);

const browser = await openBrowser();
const { page } = browser;
let failed = 0;

async function step(name, fn) {
  if (!(await withStep(page, name, fn))) failed += 1;
}

try {
  await step("q-login-cards", async () => {
    await gotoPath(page, base, "/login");
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (/кандидат №1/i.test(text)) throw new Error("виден «кандидат №1»");
    for (const name of NAMES) {
      if (!text.includes(name)) throw new Error(`нет карточки ${name}`);
    }
    await shot(page, "q-login");
  });

  await step("q-popup-esc", async () => {
    await clickLoginCard(page, "Анна Ковалёва");
    await page.keyboard.press("Escape");
    await page.locator(".modal-overlay").waitFor({ state: "hidden", timeout: 4000 });
  });

  await step("q-recruiter-home", async () => {
    await clickLoginCard(page, "Анна Ковалёва");
    await page.getByRole("button", { name: /Перейти к вакансиям/ }).click();
    await page.waitForURL(/\/vacancies/, { timeout: 8000, waitUntil: "domcontentloaded" });
    const header = await page.getByRole("link", { name: /К выбору роли/ }).count();
    if (!header) throw new Error("нет «К выбору роли»");
    await shot(page, "q-vacancies");
  });

  await step("q-kanban", async () => {
    await gotoPath(page, base, "/vacancies/python-middle");
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (text.includes("Пока пусто")) throw new Error("колонка «Пока пусто»");
    for (const name of ["Лидия Орлова", "Дмитрий Козлов", "Никита Белов", "Марина Соколова", "Павел Юрьев", "Елена Волкова", "Олег Новиков"]) {
      if (!text.includes(name.split(" ")[0])) throw new Error(`нет ${name}`);
    }
    await shot(page, "q-kanban");
  });

  await step("q-list", async () => {
    await page.getByRole("button", { name: "Список" }).click();
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (!text.includes("Лидия") || !text.includes("Марина")) throw new Error("список без людей");
    await shot(page, "q-list");
  });

  await step("q-report", async () => {
    await gotoPath(page, base, "/vacancies/python-middle/candidates/lida");
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (!/недостаточно данных/i.test(text)) throw new Error("нет подсказки недостаточно данных");
    await page.getByRole("button", { name: /Не продвигать/ }).first().click();
    await page.locator(".modal-overlay").waitFor({ state: "visible", timeout: 4000 });
    await shot(page, "q-report-modal");
    await page.keyboard.press("Escape");
  });

  await step("q-invite", async () => {
    await gotoPath(page, base, "/i/lida");
    await page.getByRole("heading", { name: "Технический этап" }).waitFor({ timeout: 5000 });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (text.includes("Напомнить позже")) throw new Error("мёртвая «Напомнить позже»");
    if (!text.includes("К выбору роли")) throw new Error("нет «К выбору роли»");
    await shot(page, "q-invite");
  });

  await step("q-bad-token", async () => {
    await gotoPath(page, base, "/i/nope");
    await page.getByRole("heading", { name: /Ссылка не найдена/ }).waitFor({ timeout: 5000 });
    await gotoPath(page, base, "/i/nope/consent");
    await page.getByRole("heading", { name: /Ссылка не найдена/ }).waitFor({ timeout: 5000 });
    await shot(page, "q-bad-token");
  });

  await step("q-new-vacancy", async () => {
    await gotoPath(page, base, "/vacancies/new");
    const back = await page.getByRole("button", { name: /Назад|Отмена/ }).count();
    if (!back) throw new Error("нет Назад/Отмена");
    await shot(page, "q-new-vacancy");
  });

  await step("q-errors", async () => {
    await gotoPath(page, base, "/403");
    const a = (await pageDigest(page)).body;
    if (!a.includes("403") && !/доступ|нет права|нельзя/i.test(a)) throw new Error("403 не объясняет");
    await gotoPath(page, base, "/404");
    const b = (await pageDigest(page)).body;
    if (!/не найд|404|нет такой/i.test(b)) throw new Error("404 не объясняет");
    await gotoPath(page, base, "/i/expired");
    const c = (await pageDigest(page)).body;
    if (!/истёк|истек|срок/i.test(c)) throw new Error("expired не объясняет");
    await shot(page, "q-expired");
  });

  await step("q-pilots", async () => {
    await gotoPath(page, base, "/expert");
    let text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (!text.includes("Пилот")) throw new Error("/expert без «Пилот»");
    await gotoPath(page, base, "/brief/python-middle");
    text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (!text.includes("Пилот")) throw new Error("/brief без «Пилот»");
    await gotoPath(page, base, "/i/lida/result");
    text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (!text.includes("Пилот")) throw new Error("result без «Пилот»");
    if (/\basync\b/.test(text) || text.includes("`sql`")) throw new Error("сырые requirementId");
    if (!text.includes("Асинхронность") && !text.includes("SQL")) throw new Error("нет человеческих названий требований");
    await shot(page, "q-result");
  });

  await step("q-lida-home", async () => {
    await gotoPath(page, base, "/login");
    await clickLoginCard(page, "Лидия Орлова");
    await page.getByRole("button", { name: /Перейти к приглашению/ }).click();
    await page.waitForURL(/\/i\/lida/, { timeout: 8000, waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Технический этап|Загружаю/ }).waitFor({ timeout: 5000 });
  });
} finally {
  await browser.close();
  clearTimeout(hardTimer);
}

console.log(failed ? `DONE with ${failed} failed step(s)` : "DONE all quickstart steps ok");
process.exit(failed ? 1 : 0);
