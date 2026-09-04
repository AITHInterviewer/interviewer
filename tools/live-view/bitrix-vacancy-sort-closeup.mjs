import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "out");
const HARD_MS = 50000;
const NAV_MS = 20000;
const VACANCY_URL = "https://bitrix.local/vacancy/";
const EVENT_URL = "https://bitrix.local/event/";

const hardTimer = setTimeout(() => {
  console.error(`HARD TIMEOUT ${HARD_MS}ms — live-view abort`);
  process.exit(2);
}, HARD_MS);

async function shot(page, name, locator) {
  await mkdir(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, name);
  if (locator) {
    await locator.screenshot({ path: file, timeout: 5000 });
  } else {
    await page.screenshot({ path: file, fullPage: false });
  }
  console.log(`  shot=${file}`);
  return file;
}

async function dismissOverlays(page) {
  const skip = page.getByText("Пропустить", { exact: true }).first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  const closeX = page.locator(".modal-overlay button, [class*='onboard'] button, [class*='tour'] button, [aria-label*='закр' i]").first();
  await page
    .evaluate(() => {
      const texts = ["Пропустить", "Отклонить"];
      for (const t of texts) {
        const el = [...document.querySelectorAll("button, a")].find((n) => (n.innerText || "").trim() === t);
        if (el) el.click();
      }
      const closeBtns = [...document.querySelectorAll("button")].filter((n) => {
        const label = (n.getAttribute("aria-label") || "") + (n.innerText || "");
        return /закрыть|close/i.test(label) && n.getBoundingClientRect().width > 0;
      });
      closeBtns.slice(0, 2).forEach((n) => n.click());
    })
    .catch(() => {});
  await page.waitForTimeout(400);
}

async function clickSort(page, label) {
  const btn = page.locator("button, [role='button']").filter({ hasText: new RegExp(`^${label}$`) }).first();
  await btn.click({ timeout: 4000 });
  await page.waitForTimeout(400);
}

async function menuInfo(page, dropSel) {
  return page.evaluate((sel) => {
    const drop = document.querySelector(sel);
    if (!drop) return { found: false };
    const s = getComputedStyle(drop);
    const r = drop.getBoundingClientRect();
    const radios = [...drop.querySelectorAll('input[type="radio"], [role="radio"], .radio, [class*="radio"]')].map((el) => ({
      tag: el.tagName,
      cls: String(el.className).slice(0, 80),
      w: Math.round(el.getBoundingClientRect().width),
      visible: getComputedStyle(el).display !== "none",
    }));
    const options = [...drop.querySelectorAll("button, a, [role='option']")].map((el) => (el.innerText || "").trim());
    return {
      found: true,
      cls: drop.className,
      text: (drop.innerText || "").trim().replace(/\s+/g, " "),
      boxShadow: s.boxShadow,
      bg: s.backgroundColor,
      w: Math.round(r.width),
      h: Math.round(r.height),
      radios,
      options,
    };
  }, dropSel);
}

const userDataDir = await mkdtemp(join(tmpdir(), "pw-live-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  channel: "chrome",
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  timeout: 15000,
  args: ["--disable-dev-shm-usage"],
});
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(8000);
page.setDefaultNavigationTimeout(NAV_MS);

try {
  await page.goto(VACANCY_URL, { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page.waitForTimeout(1000);
  await dismissOverlays(page);

  await shot(page, "vacancy-desktop-hero.png");
  console.log("ok hero");

  await clickSort(page, "По дате");
  console.log("date menu", JSON.stringify(await menuInfo(page, ".vacancies-sort__dropdown")));
  const dateGroup = page.locator(".vacancies-sort__group--open, .vacancies-sort").first();
  await shot(page, "vacancy-sort-date.png", dateGroup);
  console.log("ok date");

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);
  await clickSort(page, "По зарплате");
  console.log("salary menu", JSON.stringify(await menuInfo(page, ".vacancies-sort__dropdown")));
  const salGroup = page.locator(".vacancies-sort__group--open, .vacancies-sort").first();
  await shot(page, "vacancy-sort-salary.png", salGroup);
  console.log("ok salary");

  await page.goto(EVENT_URL, { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page.waitForTimeout(1000);
  await dismissOverlays(page);
  await clickSort(page, "По дате");
  console.log("events menu", JSON.stringify(await menuInfo(page, ".events-sort__dropdown")));
  const evGroup = page.locator(".events-sort--open, .events-sort").first();
  await shot(page, "events-sort-date.png", evGroup);
  console.log("ok events");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(VACANCY_URL, { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page.waitForTimeout(1000);
  await dismissOverlays(page);
  await shot(page, "vacancy-mobile.png");
  console.log("ok mobile");
} catch (error) {
  console.log("fail", error.message);
  await shot(page, "vacancy-fail.png").catch(() => {});
} finally {
  await context.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  clearTimeout(hardTimer);
}
