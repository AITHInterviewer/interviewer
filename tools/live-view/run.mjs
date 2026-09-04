import { detectBase, gotoPath, installHardTimeout, openBrowser, pageDigest, shot } from "./lib.mjs";

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("usage: node run.mjs /login /vacancies");
  process.exit(1);
}

const hardTimer = installHardTimeout();
const base = await detectBase();
console.log(`base=${base} headed=${process.env.PW_HEADED === "1" ? "yes" : "no"}`);

const browser = await openBrowser();
let failed = 0;

try {
  for (const [index, path] of paths.entries()) {
    const name = String(index + 1).padStart(2, "0") + path.replaceAll("/", "-").replace(/^-/, "") || "root";
    try {
      await gotoPath(browser.page, base, path);
      await shot(browser.page, name);
      const digest = await pageDigest(browser.page);
      console.log(`ok ${name}`);
      console.log(`  h1=${JSON.stringify(digest.h1)}`);
      console.log(`  text=${JSON.stringify(digest.body)}`);
    } catch (error) {
      failed += 1;
      console.log(`fail ${name} ${(error && error.message) || error}`);
      await shot(browser.page, `${name}-fail`).catch(() => {});
    }
  }
} finally {
  await browser.close();
  clearTimeout(hardTimer);
}

process.exit(failed ? 1 : 0);
