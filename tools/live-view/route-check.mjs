/** Обход маршрутов: страница открылась, ошибок нет, ссылки ведут в существующие адреса. */
import { chromium } from "playwright-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { fixtures, respond } from "./fixtures.mjs";

const base = process.env.PW_BASE ?? "http://localhost:3000";

// Список маршрутов берём из файловой структуры приложения.
const files = execSync("find app -name page.tsx", { cwd: "/Users/krivoy/Vibe/hakaton/frontend" })
  .toString().trim().split("\n");
const patterns = files
  .map((f) => f.replace(/\/page\.tsx$/, "").replace(/^app/, ""))
  .map((r) => (r === "" ? "/" : r))
  .map((r) => new RegExp("^" + r.replace(/\[[^\]]+\]/g, "[^/]+") + "$"));

const visit = [
  ["/login", true], ["/register", true], ["/", false], ["/internal", false],
  ["/vacancies", false], ["/vacancies/new", false], ["/vacancies/v-python", false],
  ["/vacancies/v-python/candidates/i-lida", false], ["/vacancies/v-python/questions", false],
  ["/vacancies/v-python/rubric", false], ["/vacancies/v-python/approve", false],
  ["/vacancies/v-python/settings", false], ["/expert", false], ["/expert/queue", false],
  ["/audit/v-python", false], ["/audit/v-python/i-lida", false],
  ["/manager", false], ["/manager/i-lida", false], ["/internal/users", false],
  ["/internal/hiring-manager", false], ["/brief/v-python", false],
  ["/i/lida", true], ["/i/lida/consent", true], ["/i/lida/check", true], ["/i/lida/rules", true],
  ["/i/lida/practice", true], ["/i/lida/done", true], ["/i/lida/transcript", true],
  ["/i/lida/request", true], ["/i/lida/extra/c1", true], ["/i/lida/resume", true],
  ["/i/lida/live", true], ["/i/expired", true], ["/interview/lida", true],
];

const dir = await mkdtemp(join(tmpdir(), "pw-"));
const ctx = await chromium.launchPersistentContext(dir, { headless: true, channel: "chrome", viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0];
page.setDefaultTimeout(8000);
await page.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respond(url.pathname)) });
});

const problems = [];
const seenLinks = new Set();

await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
await page.evaluate((s) => window.localStorage.setItem("ainterviewer-auth", JSON.stringify(s)),
  { access_token: "t", token_type: "bearer", user: fixtures.user });

for (const [path, anon] of visit) {
  if (anon) await page.evaluate(() => window.localStorage.removeItem("ainterviewer-auth"));
  else await page.evaluate((s) => window.localStorage.setItem("ainterviewer-auth", JSON.stringify(s)),
    { access_token: "t", token_type: "bearer", user: fixtures.user });

  const errs = [];
  const onErr = (e) => errs.push(String(e).slice(0, 120));
  page.on("pageerror", onErr);
  const res = await page.goto(base + path, { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(900);
  const status = res?.status() ?? 0;
  const landed = new URL(page.url()).pathname;
  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const broke = body.includes("This page couldn") || body.includes("Application error");

  const links = await page.$$eval("a[href]", (nodes) => nodes.map((n) => n.getAttribute("href")));
  for (const href of links) {
    if (!href || !href.startsWith("/") || seenLinks.has(href)) continue;
    seenLinks.add(href);
    const clean = href.split("?")[0].split("#")[0];
    if (!patterns.some((re) => re.test(clean))) problems.push(`битая ссылка ${href} на ${path}`);
  }

  if (status >= 400) problems.push(`${path}: ответ ${status}`);
  if (broke) problems.push(`${path}: страница упала`);
  if (errs.length) problems.push(`${path}: ${errs[0]}`);
  console.log(`${status} ${path}${landed !== path ? " → " + landed : ""}${broke ? "  ПАДЕНИЕ" : ""}`);
  page.off("pageerror", onErr);
}

console.log("\n=== ПРОБЛЕМЫ ===");
console.log(problems.length ? [...new Set(problems)].join("\n") : "нет");
console.log(`\nпроверено ссылок: ${seenLinks.size}`);
await ctx.close();
await rm(dir, { recursive: true, force: true });
