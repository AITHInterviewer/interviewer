/**
 * Съёмка экранов кабинета без бэкенда: ответы API подменяются фикстурами,
 * сессия кладётся в localStorage. Запуск:
 *   node mock-shots.mjs vacancies=/vacancies board=/vacancies/v-python
 */
import { chromium } from "playwright-core";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fixtures, respond } from "./fixtures.mjs";

const base = process.env.PW_BASE ?? "http://localhost:3000";
const out = join(new URL(".", import.meta.url).pathname, "out", process.env.DIR ?? "screens");
await mkdir(out, { recursive: true });

const dir = await mkdtemp(join(tmpdir(), "pw-"));
const ctx = await chromium.launchPersistentContext(dir, {
  headless: true,
  channel: "chrome",
  viewport: { width: 1440, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(8000);

await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(respond(url.pathname)),
  });
});

const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160));
});

await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
if (process.env.PW_ANON !== "1") {
  await page.evaluate((session) => {
    window.localStorage.setItem("ainterviewer-auth", JSON.stringify(session));
  }, { access_token: "demo-token", token_type: "bearer", user: fixtures.user });
}

for (const arg of process.argv.slice(2)) {
  const [name, path] = arg.split("=");
  try {
    await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: false });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    console.log(`\n### ${name} ${path}\n${text.slice(0, 700)}`);
  } catch (e) {
    console.log(`\n### ${name} ${path}\nFAIL ${e.message.slice(0, 160)}`);
  }
}
console.log("\nошибки: " + (errs.length ? [...new Set(errs)].slice(0, 6).join("\n") : "нет"));
await ctx.close();
await rm(dir, { recursive: true, force: true });
