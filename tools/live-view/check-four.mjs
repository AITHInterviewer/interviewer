import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtures, respond } from "./fixtures.mjs";

const base = process.env.PW_BASE ?? "http://localhost:3000";
const dir = await mkdtemp(join(tmpdir(), "pw-"));
const ctx = await chromium.launchPersistentContext(dir, { headless: true, channel: "chrome", viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0];
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

// медленный ответ, чтобы поймать скелетон
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("/vacancies")) await new Promise((r) => setTimeout(r, 1200));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respond(url.pathname)) });
});
await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
await page.evaluate((s) => window.localStorage.setItem("ainterviewer-auth", JSON.stringify(s)),
  { access_token: "t", token_type: "bearer", user: fixtures.user });

// 1. скелетон вместо строки «Загружаю»
await page.goto(base + "/vacancies", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
console.log("скелетон виден: " + (await page.locator(".np-skeleton").count() > 0));
console.log("текстовое «Загружаю» на экране: " + (await page.locator("text=Загружаем вакансии").count()));
await page.waitForTimeout(1500);
console.log("после загрузки скелетон убран: " + (await page.locator(".np-skeleton").count() === 0));
console.log("статус пилюлей: " + (await page.locator(".status-pill").count()));

// 2. приглашение в модалке
await page.goto(base + "/vacancies/v-python", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
console.log("форма приглашения на странице до клика: " + (await page.locator("input[type=file]").count()));
await page.getByRole("button", { name: /Пригласить кандидата/ }).click();
await page.locator(".modal-overlay").waitFor({ timeout: 4000 });
console.log("модалка открылась: " + (await page.locator(".modal-overlay").count() === 1));
await page.waitForTimeout(600);
console.log("фокус внутри: " + await page.evaluate(() => document.querySelector(".modal-card")?.contains(document.activeElement)));
console.log("активный элемент: " + await page.evaluate(() => document.activeElement?.tagName + " " + (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.className)));
await page.screenshot({ path: join(new URL(".", import.meta.url).pathname, "out", "four", "invite-modal.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
console.log("Esc закрыл: " + (await page.locator(".modal-overlay").count() === 0));

// 3. демо-маршруты удалены
const res = await page.goto(base + "/vacancies/demo/board", { waitUntil: "domcontentloaded" });
console.log("демо-доска отвечает: " + res.status());
console.log("ошибки: " + (errs.length ? [...new Set(errs)].join("\n") : "нет"));
await ctx.close();
await rm(dir, { recursive: true, force: true });
