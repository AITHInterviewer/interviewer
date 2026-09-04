import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, "out");
const HARD_MS = 50000;
const NAV_MS = 20000;

const hardTimer = setTimeout(() => {
  console.error(`HARD TIMEOUT ${HARD_MS}ms — live-view abort`);
  process.exit(2);
}, HARD_MS);

async function clipShot(page, name, box) {
  await mkdir(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, name);
  const vp = page.viewportSize() || { width: 1440, height: 900 };
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.min(vp.width - x, Math.ceil(box.width));
  const height = Math.min(vp.height - y, Math.ceil(box.height));
  await page.screenshot({ path: file, clip: { x, y, width, height } });
  console.log(`  shot=${file} clip=${JSON.stringify({ x, y, width, height })}`);
}

async function dismissOverlays(page) {
  await page
    .evaluate(() => {
      for (const t of ["Пропустить", "Отклонить"]) {
        const el = [...document.querySelectorAll("button, a")].find((n) => (n.innerText || "").trim() === t);
        if (el) el.click();
      }
    })
    .catch(() => {});
  await page.waitForTimeout(400);
}

async function openAndCapture(page, label, filename, dropSel) {
  const btn = page.locator("button").filter({ hasText: new RegExp(`^${label}$`) }).first();
  await btn.click({ timeout: 4000 });
  await page.waitForTimeout(500);

  const info = await page.evaluate((sel) => {
    const drops = [...document.querySelectorAll(sel)];
    const visible = drops
      .map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          cls: el.className,
          text: (el.innerText || "").trim().replace(/\s+/g, " "),
          boxShadow: s.boxShadow,
          bg: s.backgroundColor,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          radios: el.querySelectorAll('input[type="radio"], [role="radio"]').length,
          options: [...el.querySelectorAll("button")].map((b) => (b.innerText || "").trim()),
        };
      })
      .filter((d) => d.w > 10 && d.h > 10);
    const btns = [...document.querySelectorAll("button")].filter((b) => /По дате|По зарплате/.test((b.innerText || "").trim()));
    const btnBoxes = btns.map((b) => {
      const r = b.getBoundingClientRect();
      return { t: (b.innerText || "").trim(), x: r.x, y: r.y, w: r.width, h: r.height };
    });
    return { visible, btnBoxes };
  }, dropSel);

  console.log(`  ${filename} ${JSON.stringify(info)}`);

  const drop = info.visible[0];
  const btns = info.btnBoxes;
  if (!drop && !btns.length) throw new Error("no menu and no buttons");

  const xs = [...btns.map((b) => b.x), drop ? drop.x : 0];
  const ys = [...btns.map((b) => b.y), drop ? drop.y : 0];
  const rights = [...btns.map((b) => b.x + b.w), drop ? drop.x + drop.w : 0];
  const bottoms = [...btns.map((b) => b.y + b.h), drop ? drop.y + drop.h : 0];
  const pad = 16;
  await clipShot(page, filename, {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...rights) - Math.min(...xs) + pad * 2,
    height: Math.max(...bottoms) - Math.min(...ys) + pad * 2,
  });
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
  await page.goto("https://bitrix.local/vacancy/", { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page.waitForTimeout(1000);
  await dismissOverlays(page);

  await openAndCapture(page, "По дате", "vacancy-sort-date.png", ".vacancies-sort__dropdown");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  await openAndCapture(page, "По зарплате", "vacancy-sort-salary.png", ".vacancies-sort__dropdown");

  await page.goto("https://bitrix.local/event/", { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page.waitForTimeout(1000);
  await dismissOverlays(page);
  await openAndCapture(page, "По дате", "events-sort-date.png", ".events-sort__dropdown");
} catch (error) {
  console.log("fail", error.message);
} finally {
  await context.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  clearTimeout(hardTimer);
}
