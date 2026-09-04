import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "out");
const HARD_MS = 50000;
const NAV_MS = 20000;
const STEP_MS = 12000;
const VACANCY_URL = "https://bitrix.local/vacancy/";
const EVENT_URL = "https://bitrix.local/event/";

const hardTimer = setTimeout(() => {
  console.error(`HARD TIMEOUT ${HARD_MS}ms — live-view abort`);
  process.exit(2);
}, HARD_MS);

function stepTimeout(ms = STEP_MS) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`step timeout ${ms}ms`)), ms);
  });
}

async function withStep(name, fn) {
  const started = Date.now();
  try {
    await Promise.race([fn(), stepTimeout()]);
    console.log(`ok ${name} ${Date.now() - started}ms`);
    return true;
  } catch (error) {
    console.log(`fail ${name} ${Date.now() - started}ms ${(error && error.message) || error}`);
    return false;
  }
}

async function digest(page) {
  return page
    .evaluate(() => {
      const h1 = document.querySelector("h1");
      const title = document.title;
      const text = (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 400);
      const radios = document.querySelectorAll('input[type="radio"]').length;
      const sortBtns = [...document.querySelectorAll("button, a, [role='button']")]
        .map((el) => (el.innerText || "").trim().replace(/\s+/g, " "))
        .filter((t) => /По дате|По зарплате|Сначала/i.test(t))
        .slice(0, 12);
      return { title, h1: h1 ? h1.innerText.trim() : "", text, radios, sortBtns };
    })
    .catch((e) => ({ title: "", h1: "", text: String(e.message), radios: 0, sortBtns: [] }));
}

async function inspectOpenMenu(page) {
  return page
    .evaluate(() => {
      const texts = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const t = (el.innerText || "").trim();
          if (!t) return false;
          return /Сначала новые|Сначала старые|По возрастанию|По убыванию/.test(t) && t.length < 80;
        })
        .map((el) => (el.innerText || "").trim().replace(/\s+/g, " "))
        .slice(0, 16);

      const visibleRadios = [...document.querySelectorAll('input[type="radio"], [role="radio"], .bx-radio, .radio')]
        .filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
        })
        .map((el) => ({
          tag: el.tagName,
          role: el.getAttribute("role"),
          type: el.getAttribute("type"),
          cls: el.className?.toString?.().slice(0, 80) || "",
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
        }));

      const menuCandidates = [...document.querySelectorAll("[class*='sort'], [class*='dropdown'], [class*='menu'], [class*='popup'], [class*='select']")]
        .filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (s.display === "none" || r.height < 20 || r.width < 40) return false;
          const t = (el.innerText || "").trim();
          return /Сначала|По возрастанию|По убыванию/.test(t);
        })
        .slice(0, 6)
        .map((el) => {
          const s = getComputedStyle(el);
          return {
            tag: el.tagName,
            cls: el.className?.toString?.().slice(0, 120) || "",
            text: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 160),
            boxShadow: s.boxShadow,
            bg: s.backgroundColor,
            w: Math.round(el.getBoundingClientRect().width),
            h: Math.round(el.getBoundingClientRect().height),
          };
        });

      return { texts, visibleRadios, menuCandidates };
    })
    .catch((e) => ({ texts: [], visibleRadios: [], menuCandidates: [], error: e.message }));
}

async function clickByText(page, label) {
  const loc = page.getByText(label, { exact: true }).first();
  if (await loc.count()) {
    await loc.click({ timeout: 4000 });
    return true;
  }
  const fuzzy = page.getByText(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first();
  await fuzzy.click({ timeout: 4000 });
  return true;
}

async function shot(page, name) {
  await mkdir(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  shot=${file}`);
  return file;
}

const userDataDir = await mkdtemp(join(tmpdir(), "pw-live-"));
let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.PW_HEADED !== "1",
    channel: "chrome",
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    timeout: 15000,
    args: ["--disable-dev-shm-usage"],
  });
} catch (error) {
  console.error("channel=chrome failed:", error.message);
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.PW_HEADED !== "1",
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    timeout: 15000,
    args: ["--disable-dev-shm-usage"],
  });
}

const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(8000);
page.setDefaultNavigationTimeout(NAV_MS);

const results = {};

try {
  results.vacancyOpen = await withStep("01-open-vacancy", async () => {
    await page.goto(VACANCY_URL, { waitUntil: "domcontentloaded", timeout: NAV_MS });
    await page.waitForSelector("h1, .page-title, main, body", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const d = await digest(page);
    console.log(`  url=${page.url()}`);
    console.log(`  title=${JSON.stringify(d.title)}`);
    console.log(`  h1=${JSON.stringify(d.h1)}`);
    console.log(`  text=${JSON.stringify(d.text)}`);
    console.log(`  sortBtns=${JSON.stringify(d.sortBtns)}`);
    await shot(page, "vacancy-desktop-hero.png");
  });

  results.sortDate = await withStep("02-sort-date", async () => {
    await clickByText(page, "По дате");
    await page.waitForTimeout(600);
    const menu = await inspectOpenMenu(page);
    console.log(`  menu=${JSON.stringify(menu)}`);
    await shot(page, "vacancy-sort-date.png");
  });

  await page.keyboard.press("Escape").catch(() => {});
  await page.mouse.click(10, 10).catch(() => {});
  await page.waitForTimeout(300);

  results.sortSalary = await withStep("03-sort-salary", async () => {
    await clickByText(page, "По зарплате");
    await page.waitForTimeout(600);
    const menu = await inspectOpenMenu(page);
    console.log(`  menu=${JSON.stringify(menu)}`);
    await shot(page, "vacancy-sort-salary.png");
  });

  results.events = await withStep("04-events-sort-date", async () => {
    await page.goto(EVENT_URL, { waitUntil: "domcontentloaded", timeout: NAV_MS });
    await page.waitForSelector("h1, .page-title, main, body", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const d = await digest(page);
    console.log(`  url=${page.url()}`);
    console.log(`  h1=${JSON.stringify(d.h1)}`);
    console.log(`  text=${JSON.stringify(d.text)}`);
    console.log(`  sortBtns=${JSON.stringify(d.sortBtns)}`);
    await clickByText(page, "По дате");
    await page.waitForTimeout(600);
    const menu = await inspectOpenMenu(page);
    console.log(`  menu=${JSON.stringify(menu)}`);
    await shot(page, "events-sort-date.png");
  });

  results.mobile = await withStep("05-vacancy-mobile", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(VACANCY_URL, { waitUntil: "domcontentloaded", timeout: NAV_MS });
    await page.waitForSelector("h1, .page-title, main, body", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const d = await digest(page);
    console.log(`  url=${page.url()}`);
    console.log(`  h1=${JSON.stringify(d.h1)}`);
    console.log(`  text=${JSON.stringify(d.text)}`);
    console.log(`  sortBtns=${JSON.stringify(d.sortBtns)}`);
    await shot(page, "vacancy-mobile.png");
  });
} finally {
  await context.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  clearTimeout(hardTimer);
}

console.log("RESULTS", JSON.stringify(results));
const failed = Object.values(results).filter((v) => !v).length;
process.exit(failed ? 1 : 0);
