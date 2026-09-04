import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const OUT = "/tmp/vacancy-verify-out";
const URL = "https://bitrix.local/vacancy/";
const HARD_MS = 50000;
const timer = setTimeout(() => {
  console.error("HARD TIMEOUT");
  process.exit(2);
}, HARD_MS);

await mkdir(OUT, { recursive: true });

const context = await chromium.launchPersistentContext("/tmp/pw-vac-verify", {
  headless: true,
  channel: "chrome",
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  args: ["--disable-dev-shm-usage"],
});
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(20000);

async function seedNoTour() {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("chg.vacancyOnboarding.v2", "1");
    } catch {}
  });
}

function dump(label, obj) {
  console.log(label, JSON.stringify(obj, null, 2));
}

try {
  await seedNoTour();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#vacancyPage", { timeout: 12000 });
  await page.waitForTimeout(1500);
  const boot = await page.evaluate(() => ({
    url: location.href,
    hasToggle: !!document.querySelector(".vacancies-sort__toggle"),
    hasVacancySort: !!document.querySelector(".vacancy-sort"),
    toolbar: document.querySelector(".new-vacancies__toolbar")?.innerHTML?.slice(0, 400) || null,
    scripts: [...document.scripts].map((s) => s.src).filter((s) => /vacancy-with-ai/.test(s)),
  }));
  dump("BOOT", boot);
  await page.waitForSelector(".vacancies-sort__toggle", { timeout: 15000 });
  await page.waitForTimeout(400);

  const desktop = await page.evaluate(() => {
    const card = document.querySelector(".hero-vacancy__card");
    const header = document.querySelector("#pageHeader");
    const search = document.querySelector(".hero-vacancy__search-container, .nmp-hero__search");
    const toolbar = document.querySelector(".new-vacancies__toolbar");
    const count = document.querySelector(".new-vacancies__count");
    const sortRoot = document.querySelector(".vacancy-sort");
    const filter = document.querySelector(".new-vacancies__filter, .vacancies-filter");
    const cs = card ? getComputedStyle(card) : null;
    const hero = document.querySelector(".hero-vacancy");
    const heroCs = hero ? getComputedStyle(hero) : null;
    const searchEl = document.querySelector(".nmp-hero__search");
    const searchCs = searchEl ? getComputedStyle(searchEl) : null;
    const toggles = [...document.querySelectorAll(".vacancies-sort__toggle")].map((el) =>
      (el.innerText || "").trim().replace(/\s+/g, " "),
    );
    const radiosInSort = [...document.querySelectorAll(".vacancy-sort input[type=radio], .vacancies-sort input[type=radio]")].length;
    const radiosOnPage = document.querySelectorAll('input[type="radio"]').length;
    const menusWrapper = document.querySelector(".vacancies-sort__menus-wrapper");
    const oldTitle = document.querySelector(".vacancies-sort__title");
    const cardContainsHeader = !!(card && header && card.contains(header));
    const cardContainsSearch = !!(card && search && card.contains(search));
    const cardContainsSort = !!(card && sortRoot && card.contains(sortRoot));
    const cardContainsCount = !!(card && count && card.contains(count));
    const toolbarContainsSort = !!(toolbar && sortRoot && toolbar.contains(sortRoot));
    const toolbarContainsCount = !!(toolbar && count && toolbar.contains(count));
    return {
      card: card
        ? {
            classes: card.className,
            bg: cs.backgroundColor,
            radius: cs.borderRadius,
            padding: cs.padding,
            overflow: cs.overflow,
            overflowX: cs.overflowX,
            overflowY: cs.overflowY,
          }
        : null,
      heroOverflow: heroCs ? { overflow: heroCs.overflow, padding: heroCs.padding } : null,
      searchShadow: searchCs ? searchCs.boxShadow : null,
      headerIdOn: header ? header.id : null,
      headerClass: header ? header.className : null,
      cardContainsHeader,
      cardContainsSearch,
      cardContainsSort,
      cardContainsCount,
      toolbarContainsSort,
      toolbarContainsCount,
      toggles,
      radiosInSort,
      radiosOnPage,
      hasMenusWrapper: !!menusWrapper,
      hasOldTitle: !!oldTitle,
      hasFilter: !!filter,
      filterText: filter ? (filter.innerText || "").slice(0, 80) : null,
    };
  });
  dump("DESKTOP_DOM", desktop);
  await page.screenshot({ path: join(OUT, "desktop-hero.png") });

  const toggles = page.locator(".vacancies-sort__toggle");
  const nToggles = await toggles.count();
  console.log("toggleCount", nToggles);

  // open date
  await toggles.nth(0).click();
  await page.waitForTimeout(200);
  const afterDate = await page.evaluate(() => {
    const groups = [...document.querySelectorAll(".vacancies-sort__group")];
    return groups.map((g) => ({
      open: g.classList.contains("vacancies-sort__group--open"),
      label: (g.querySelector(".vacancies-sort__toggle")?.innerText || "").trim(),
      dropdownVisible: !!(g.querySelector(".vacancies-sort__dropdown") && getComputedStyle(g.querySelector(".vacancies-sort__dropdown")).display !== "none"),
      options: [...g.querySelectorAll(".vacancies-sort__option")].map((o) => o.innerText.trim()),
    }));
  });
  dump("AFTER_DATE_OPEN", afterDate);
  await page.screenshot({ path: join(OUT, "date-open.png") });

  // open salary while date open — only one should remain
  await toggles.nth(1).click();
  await page.waitForTimeout(200);
  const afterSalary = await page.evaluate(() => {
    const groups = [...document.querySelectorAll(".vacancies-sort__group")];
    return groups.map((g) => ({
      open: g.classList.contains("vacancies-sort__group--open"),
      dropdownVisible: !!(g.querySelector(".vacancies-sort__dropdown") && getComputedStyle(g.querySelector(".vacancies-sort__dropdown")).display !== "none"),
    }));
  });
  dump("AFTER_SALARY_OPEN", afterSalary);

  // click outside
  await page.mouse.click(20, 20);
  await page.waitForTimeout(200);
  const afterOutside = await page.evaluate(() => {
    const groups = [...document.querySelectorAll(".vacancies-sort__group")];
    return groups.map((g) => ({
      open: g.classList.contains("vacancies-sort__group--open"),
      dropdownVisible: !!(g.querySelector(".vacancies-sort__dropdown") && getComputedStyle(g.querySelector(".vacancies-sort__dropdown")).display !== "none"),
    }));
  });
  dump("AFTER_OUTSIDE", afterOutside);

  // hit-test dropdown without scrolling
  await toggles.nth(0).click();
  await page.waitForTimeout(150);
  const hit = await page.evaluate(() => {
    const opt = document.querySelector(".vacancies-sort__option");
    const dd = document.querySelector(".vacancies-sort__group--open .vacancies-sort__dropdown");
    if (!opt || !dd) return { missing: true };
    const r = opt.getBoundingClientRect();
    const d = dd.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      optRect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      ddRect: { x: Math.round(d.left), y: Math.round(d.top), w: Math.round(d.width), h: Math.round(d.height), display: getComputedStyle(dd).display, z: getComputedStyle(dd).zIndex },
      hit: top ? { tag: top.tagName, cls: (top.className || "").toString().slice(0, 120), text: (top.innerText || "").trim().slice(0, 60) } : null,
    };
  });
  dump("HITTEST", hit);

  const afterSelect = await page.evaluate(() => {
    const opt = [...document.querySelectorAll(".vacancies-sort__option")].find((el) => el.textContent.includes("Сначала новые"));
    opt && opt.click();
    const t0 = document.querySelectorAll(".vacancies-sort__toggle")[0];
    return {
      label: (t0?.innerText || "").trim().replace(/\s+/g, " "),
      url: location.href,
    };
  });
  dump("AFTER_SELECT_NEW", afterSelect);

  await toggles.nth(0).click();
  await page.waitForTimeout(150);
  const activeBefore = await page.evaluate(() =>
    [...document.querySelectorAll(".vacancies-sort__option--active")].map((el) => el.innerText.trim()),
  );
  dump("ACTIVE_BEFORE_RECLICK", activeBefore);
  const afterReselect = await page.evaluate(() => {
    const opt = [...document.querySelectorAll(".vacancies-sort__option")].find((el) => el.textContent.includes("Сначала новые"));
    opt && opt.click();
    const t0 = document.querySelectorAll(".vacancies-sort__toggle")[0];
    return {
      label: (t0?.innerText || "").trim().replace(/\s+/g, " "),
      url: location.href,
      active: [...document.querySelectorAll(".vacancies-sort__option--active")].map((el) => el.innerText.trim()),
    };
  });
  dump("AFTER_RECLICK", afterReselect);

  // computed tokens of toggle/dropdown
  await toggles.nth(0).click();
  await page.waitForTimeout(150);
  const tokens = await page.evaluate(() => {
    const toggle = document.querySelector(".vacancies-sort__toggle");
    const dd = document.querySelector(".vacancies-sort__group--open .vacancies-sort__dropdown");
    const opt = dd?.querySelector(".vacancies-sort__option");
    const ts = getComputedStyle(toggle);
    const ds = dd ? getComputedStyle(dd) : null;
    const os = opt ? getComputedStyle(opt) : null;
    return {
      toggle: { h: ts.height, radius: ts.borderRadius, fs: ts.fontSize },
      dropdown: ds ? { radius: ds.borderRadius, shadow: ds.boxShadow, padding: ds.padding } : null,
      option: os ? { color: os.color } : null,
    };
  });
  dump("TOKENS_DESKTOP", tokens);

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => {
    const card = document.querySelector(".hero-vacancy__card");
    const cs = card ? getComputedStyle(card) : null;
    const toggles = [...document.querySelectorAll(".vacancies-sort__toggle")];
    const tcs = toggles[0] ? getComputedStyle(toggles[0]) : null;
    const sortWrap = document.querySelector(".vacancies-sort");
    const sw = sortWrap ? getComputedStyle(sortWrap) : null;
    const menus = document.querySelector(".vacancies-sort__menus-wrapper");
    const menusCs = menus ? getComputedStyle(menus) : null;
    return {
      card: cs
        ? { bg: cs.backgroundColor, radius: cs.borderRadius, padding: cs.padding }
        : null,
      toggle: tcs
        ? {
            h: tcs.height,
            radius: tcs.borderRadius,
            display: tcs.display,
            transform: tcs.transform,
            opacity: tcs.opacity,
            text: (toggles[0].innerText || "").trim(),
          }
        : null,
      sortWrap: sw ? { transform: sw.transform, opacity: sw.opacity, display: sw.display } : null,
      menus: menus ? { transform: menusCs.transform, opacity: menusCs.opacity } : null,
      toggleCount: toggles.length,
      filter: !!document.querySelector(".vacancies-filter"),
    };
  });
  dump("MOBILE", mobile);
  await page.screenshot({ path: join(OUT, "mobile.png") });

  await toggles.nth(0).click();
  await page.waitForTimeout(200);
  const mobileOpen = await page.evaluate(() => {
    const groups = [...document.querySelectorAll(".vacancies-sort__group")];
    return groups.map((g) => ({
      open: g.classList.contains("vacancies-sort__group--open"),
      dropdownVisible: !!(g.querySelector(".vacancies-sort__dropdown") && getComputedStyle(g.querySelector(".vacancies-sort__dropdown")).display !== "none"),
      ddTransform: g.querySelector(".vacancies-sort__dropdown")
        ? getComputedStyle(g.querySelector(".vacancies-sort__dropdown")).transform
        : null,
      ddOpacity: g.querySelector(".vacancies-sort__dropdown")
        ? getComputedStyle(g.querySelector(".vacancies-sort__dropdown")).opacity
        : null,
    }));
  });
  dump("MOBILE_DATE_OPEN", mobileOpen);
  await page.screenshot({ path: join(OUT, "mobile-date-open.png") });
} catch (e) {
  console.error("EXCEPTION", e);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  clearTimeout(timer);
}
