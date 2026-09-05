import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const routes = ["/login", "/i/expired", "/expert", "/manager", "/vacancies", "/internal/hiring-manager"];

const browser = await Promise.race([
  chromium.launch({ channel: "chrome" }),
  new Promise((_, reject) => setTimeout(() => reject(new Error("chrome launch timeout")), 15000)),
]);

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(12000);
const results = [];

for (const path of routes) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const body = await page.locator("body").innerText();
  results.push({
    path,
    url: page.url(),
    title: await page.locator("h1").first().innerText().catch(() => null),
    laptopGate: /откройте с ноутбука|только с ноутбука/i.test(body),
  });
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/i/expired`, { waitUntil: "domcontentloaded" });
const mobile = await page.locator("body").innerText();
results.push({
  path: "/i/expired@390",
  title: await page.locator("h1").first().innerText().catch(() => null),
  laptopGate: /откройте с ноутбука|только с ноутбука/i.test(mobile),
});

console.log(JSON.stringify(results, null, 2));
await browser.close();
