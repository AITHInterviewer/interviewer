import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "out");
const HARD_MS = 20000;
const hardTimer = setTimeout(() => process.exit(2), HARD_MS);

const userDataDir = await mkdtemp(join(tmpdir(), "pw-live-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  channel: "chrome",
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  args: ["--disable-dev-shm-usage"],
});
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultNavigationTimeout(20000);
await mkdir(OUT_DIR, { recursive: true });

try {
  await page.goto("https://bitrix.local/vacancy/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    for (const t of ["Пропустить", "Отклонить"]) {
      const el = [...document.querySelectorAll("button, a")].find((n) => (n.innerText || "").trim() === t);
      if (el) el.click();
    }
  });
  await page.waitForTimeout(300);

  await page.locator("button").filter({ hasText: /^По дате$/ }).first().click();
  await page.waitForTimeout(400);
  const dateDrop = page.locator(".vacancies-sort__dropdown").filter({ hasText: "Сначала новые" });
  await dateDrop.screenshot({ path: join(OUT_DIR, "vacancy-sort-date-menu-only.png") });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.locator("button").filter({ hasText: /^По зарплате$/ }).first().click();
  await page.waitForTimeout(400);
  const salDrop = page.locator(".vacancies-sort__dropdown").filter({ hasText: "По убыванию" });
  await salDrop.screenshot({ path: join(OUT_DIR, "vacancy-sort-salary-menu-only.png") });
  console.log("ok dropdown-only shots");
} finally {
  await context.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  clearTimeout(hardTimer);
}
