import {
  clickLoginCard,
  detectBase,
  gotoPath,
  installHardTimeout,
  openBrowser,
  shot,
  waitForHydration,
  withStep,
} from "./lib.mjs";

process.env.PW_HARD_MS ??= "90000";
const hardTimer = installHardTimeout();
const base = await detectBase();
console.log(`base=${base}`);

const browser = await openBrowser();
const { page } = browser;
let failed = 0;

try {
  if (
    !(await withStep(page, "01-login", async () => {
      await gotoPath(page, base, "/login");
      await page.locator(".login-card").first().waitFor({ timeout: 5000 });
      await waitForHydration(page, ".login-card");
      const text = await page.locator("body").innerText();
      if (!text.includes("Открыть")) throw new Error("no «Открыть» on login cards");
      await shot(page, "01-login");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "02-expert-modal", async () => {
      await clickLoginCard(page, "Алексей");
      const dialog = (await page.locator(".modal-overlay").innerText()).replace(/\s+/g, " ");
      if (!/Открыть задачи/.test(dialog)) throw new Error(`continue label missing: ${dialog.slice(0, 200)}`);
      await shot(page, "02-expert-modal");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "03-overlay-closed", async () => {
      await page.mouse.click(20, 20);
      await page.locator(".modal-overlay").waitFor({ state: "hidden", timeout: 4000 });
      await shot(page, "03-overlay-closed");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "04-expert-home", async () => {
      await clickLoginCard(page, "Алексей");
      await page.getByRole("button", { name: /Открыть задачи/ }).click();
      await page.waitForURL(/\/expert/, { timeout: 8000, waitUntil: "domcontentloaded" });
      if (page.url().includes("/rubric")) throw new Error("landed on rubric");
      await shot(page, "04-expert-home");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "05-admin-nav", async () => {
      await gotoPath(page, base, "/login");
      await clickLoginCard(page, "Ольга Белова");
      await page.getByRole("button", { name: /Открыть все разделы/ }).click();
      await page.waitForURL(/\/vacancies/, { timeout: 8000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      const extra = page.getByRole("link", { name: "Доп. вопрос (пилот)" });
      await extra.waitFor({ timeout: 5000 });
      await shot(page, "05-admin-nav");
      await extra.click();
      await page.waitForURL(/\/i\/lida\/extra/, { timeout: 8000, waitUntil: "domcontentloaded" });
      await shot(page, "06-extra");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "07-kanban", async () => {
      await gotoPath(page, base, "/vacancies/python-middle");
      await page.waitForSelector(".kanban, h1", { timeout: 8000 });
      const text = await page.locator("body").innerText();
      if (text.includes("отчёта ещё нет")) throw new Error("kanban still says «отчёта ещё нет»");
      await shot(page, "07-kanban");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "08-done", async () => {
      await gotoPath(page, base, "/i/lida/done");
      await page.getByRole("link", { name: /Дополнительный вопрос/ }).waitFor({ timeout: 5000 });
      await shot(page, "08-done");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "09-approve", async () => {
      await gotoPath(page, base, "/vacancies/python-middle/approve");
      const btn = page.getByRole("button", { name: /Утвердить v2/ });
      await btn.waitFor({ timeout: 5000 });
      await waitForHydration(page, ".button");
      if (await btn.isDisabled()) throw new Error("approve still disabled");
      await btn.click();
      await page.locator(".toast").waitFor({ timeout: 4000 });
      await shot(page, "09-approve");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "10-consent-hint", async () => {
      await gotoPath(page, base, "/i/dmitry/consent");
      const hint = await page.locator(".disabled-hint").innerText();
      if (!hint.includes("аудио")) throw new Error(`hint=${hint}`);
      await shot(page, "10-consent-hint");
    }))
  )
    failed += 1;

  if (
    !(await withStep(page, "11-followup", async () => {
      await gotoPath(page, base, "/i/dmitry/q/1/follow-up");
      const h1 = (await page.locator("h1").first().innerText()).trim();
      if (!h1) throw new Error("empty follow-up h1");
      console.log(`  followup-h1=${JSON.stringify(h1)}`);
      await shot(page, "11-followup");
    }))
  )
    failed += 1;
} finally {
  await browser.close();
  clearTimeout(hardTimer);
}

console.log(failed ? `DONE with ${failed} failed step(s)` : "DONE all steps ok");
process.exit(failed ? 1 : 0);
