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

const hardTimer = installHardTimeout();
const base = await detectBase();
console.log(`base=${base} headed=${process.env.PW_HEADED === "1" ? "yes" : "no"}`);

const browser = await openBrowser();
const { page } = browser;
let failed = 0;

try {
  if (
    !(await withStep(page, "01-login", async () => {
      await gotoPath(page, base, "/login");
      await page.locator(".login-card").first().waitFor({ timeout: 5000 });
      await waitForHydration(page, ".login-card");
      await shot(page, "01-login");
    }))
  ) {
    failed += 1;
  }

  if (
    !(await withStep(page, "02-onboarding-modal", async () => {
      await clickLoginCard(page, "Анна Ковалёва");
      await shot(page, "02-onboarding-modal");
      const dialog = (await page.locator(".modal-overlay").innerText()).replace(/\s+/g, " ").slice(0, 300);
      console.log(`  dialog=${JSON.stringify(dialog)}`);
    }))
  ) {
    failed += 1;
  }

  if (
    !(await withStep(page, "03-vacancies", async () => {
      await page.getByRole("button", { name: /Перейти к вакансиям/ }).click();
      await page.waitForURL(/\/vacancies/, { timeout: 8000, waitUntil: "domcontentloaded" });
      await shot(page, "03-vacancies");
    }))
  ) {
    failed += 1;
  }

  if (
    !(await withStep(page, "04-kanban", async () => {
      await gotoPath(page, base, "/vacancies/python-middle");
      await page.waitForSelector(".kanban, h1", { timeout: 8000 });
      await shot(page, "04-kanban");
    }))
  ) {
    failed += 1;
  }

  if (
    !(await withStep(page, "05-report", async () => {
      await gotoPath(page, base, "/vacancies/python-middle/candidates/lida");
      await shot(page, "05-report");
    }))
  ) {
    failed += 1;
  }

  if (
    !(await withStep(page, "06-invite", async () => {
      await gotoPath(page, base, "/i/lida");
      await page.getByRole("heading", { name: /Технический этап|Загружаю/ }).waitFor({ timeout: 5000 });
      await page.getByRole("heading", { name: "Технический этап" }).waitFor({ timeout: 5000 });
      await shot(page, "06-invite");
    }))
  ) {
    failed += 1;
  }

  if (
    !(await withStep(page, "07-result", async () => {
      await gotoPath(page, base, "/i/lida/result");
      await shot(page, "07-result");
    }))
  ) {
    failed += 1;
  }

  if (
    !(await withStep(page, "08-switch-role", async () => {
      const link = page.getByRole("link", { name: /К выбору роли/ });
      if (await link.count()) {
        await link.first().click();
        await page.waitForURL(/\/login/, { timeout: 8000, waitUntil: "domcontentloaded" });
      } else {
        await gotoPath(page, base, "/login");
      }
      await shot(page, "08-login-again");
    }))
  ) {
    failed += 1;
  }
} finally {
  await browser.close();
  clearTimeout(hardTimer);
}

console.log(failed ? `DONE with ${failed} failed step(s)` : "DONE all steps ok");
process.exit(failed ? 1 : 0);
