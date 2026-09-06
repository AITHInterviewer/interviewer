import { chromium } from "playwright-core";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PW_BASE ?? "http://localhost:3000";
const out = new URL("./out/shadcn/", import.meta.url).pathname;
await mkdir(out, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "pw-"));
const ctx = await chromium.launchPersistentContext(dir, { headless: true, channel: "chrome", viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(8000);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
for (const arg of process.argv.slice(2)) {
  const [name, path] = arg.split("=");
  try {
    await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(`${name}: ` + (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 220));
  } catch (e) {
    console.log(`${name} FAIL ${e.message.slice(0, 120)}`);
  }
}
console.log("ошибки: " + (errs.length ? [...new Set(errs)].join("\n") : "нет"));
await ctx.close();
await rm(dir, { recursive: true, force: true });
