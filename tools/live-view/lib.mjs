import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));

export const OUT_DIR = process.env.PW_OUT ?? join(here, "out");
export const NAV_MS = 8000;
export const STEP_MS = 12000;
export const HARD_MS = Number(process.env.PW_HARD_MS ?? 50000);

export function installHardTimeout() {
  return setTimeout(() => {
    console.error(`HARD TIMEOUT ${HARD_MS}ms — live-view abort`);
    process.exit(2);
  }, HARD_MS);
}

export async function detectBase() {
  if (process.env.PW_BASE) return process.env.PW_BASE.replace(/\/$/, "");
  // Prefer localhost over 127.0.0.1: Next.js Turbopack HMR/hydration breaks on 127.0.0.1
  // (WebSocket upgrade fails, React never attaches, clicks and useEffect do nothing).
  const hosts = ["localhost", "127.0.0.1"];
  const ports = [3001, 3000, 3002];
  for (const host of hosts) {
    for (const port of ports) {
      const url = `http://${host}:${port}`;
      try {
        const res = await fetch(`${url}/login`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return url;
      } catch {
        /* try next */
      }
    }
  }
  throw new Error("Dev-сервер не отвечает на localhost:3001/3000. Запустите: cd frontend && npm run dev");
}

export async function openBrowser() {
  const headed = process.env.PW_HEADED === "1";
  const userDataDir = await mkdtemp(join(tmpdir(), "pw-live-"));
  const options = {
    headless: !headed,
    viewport: { width: 1440, height: 900 },
    timeout: 15000,
    args: ["--disable-dev-shm-usage"],
  };

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      ...options,
      channel: "chrome",
    });
  } catch (error) {
    console.error("channel=chrome failed:", error.message);
    context = await chromium.launchPersistentContext(userDataDir, options);
  }

  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(NAV_MS);

  return {
    context,
    page,
    headed,
    async close() {
      await context.close().catch(() => {});
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

export async function waitForHydration(page, selector) {
  try {
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        return Object.keys(el).some(
          (key) =>
            key.startsWith("__reactFiber") ||
            key.startsWith("__reactProps") ||
            key.startsWith("__reactInternalInstance"),
        );
      },
      selector,
      { timeout: 2500 },
    );
  } catch {
    /* React 19 may not expose fiber keys; localhost + real click is enough */
  }
}

export async function gotoPath(page, base, path) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: NAV_MS });
  await page
    .waitForSelector("h1, .login-card, .page-title, .kanban, .screen-state, main", { timeout: 8000 })
    .catch(() => {});
}

export async function shot(page, name, outDir = OUT_DIR) {
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export async function pageDigest(page) {
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 280);
  return { h1, body };
}

export async function withStep(page, name, fn) {
  const started = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`step timeout ${STEP_MS}ms`)), STEP_MS);
      }),
    ]);
    const digest = await pageDigest(page);
    console.log(`ok ${name} ${Date.now() - started}ms`);
    console.log(`  h1=${JSON.stringify(digest.h1)}`);
    console.log(`  text=${JSON.stringify(digest.body)}`);
    return true;
  } catch (error) {
    console.log(`fail ${name} ${Date.now() - started}ms ${(error && error.message) || error}`);
    await shot(page, `${name}-fail`).catch(() => {});
    return false;
  }
}

export async function clickLoginCard(page, personName) {
  const card = page.locator(".login-card").filter({ hasText: personName }).first();
  await card.waitFor({ state: "visible", timeout: 5000 });
  await waitForHydration(page, ".login-card");
  await card.click({ timeout: 5000 });
  const overlay = page.locator(".modal-overlay");
  try {
    await overlay.waitFor({ state: "visible", timeout: 2500 });
  } catch {
    await card.evaluate((el) => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    });
    await overlay.waitFor({ state: "visible", timeout: 4000 });
  }
}
