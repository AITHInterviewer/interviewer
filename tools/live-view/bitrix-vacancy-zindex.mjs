import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const hardTimer = setTimeout(() => process.exit(2), 25000);
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

function stackAt(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const list = document.elementsFromPoint(x, y).slice(0, 8).map((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: String(el.className).slice(0, 80),
        z: s.zIndex,
        pos: s.position,
        text: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    return list;
  }, { x, y });
}

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
  const dateBox = await page.evaluate(() => {
    const el = document.querySelector(".vacancies-sort__dropdown");
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { x: r.x, y: r.y, w: r.width, h: r.height, z: s.zIndex, pos: s.position, overflow: s.overflow, opacity: s.opacity };
  });
  console.log("VAC date box", JSON.stringify(dateBox));
  const cx = dateBox.x + dateBox.w / 2;
  const cy = dateBox.y + 40;
  console.log("VAC date stack", JSON.stringify(await stackAt(page, cx, cy), null, 0));

  await page.goto("https://bitrix.local/event/", { waitUntil: "domcontentloaded", timeout: 20000 });
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
  const evBox = await page.evaluate(() => {
    const el = document.querySelector(".events-sort__dropdown");
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { x: r.x, y: r.y, w: r.width, h: r.height, z: s.zIndex, pos: s.position, overflow: s.overflow, opacity: s.opacity };
  });
  console.log("EV date box", JSON.stringify(evBox));
  console.log("EV date stack", JSON.stringify(await stackAt(page, evBox.x + evBox.w / 2, evBox.y + 40), null, 0));
} finally {
  await context.close().catch(() => {});
  await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  clearTimeout(hardTimer);
}
