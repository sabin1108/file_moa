import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const base = "http://127.0.0.1:3035";
const output = "docs/verification/settings-display-cache";
mkdirSync(output, { recursive: true });
const results = [];
const check = (name, value) => { results.push({ name, passed: Boolean(value) }); assert.ok(value, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] });

async function wait(page, predicate) {
  for (let index = 0; index < 100; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;
    await pause(60);
  }
  throw new Error("Settings browser fixture did not become ready.");
}

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.goto(`${base}/settings`, { settleMs: 200 });
  check("production settings still requires login", await page.eval(() => location.pathname === "/login"));
  await page.goto(`${base}/demo`, { settleMs: 200 });
  await page.goto(`${base}/demo/settings?tab=controls`, { settleMs: 250 });
  await wait(page, () => document.querySelector('[aria-label="빠른 전환 단축키"]')?.checkVisibility());
  check("local preferences remain available on the shared production settings UI", true);
  await page.eval(() => {
    const input = document.querySelector('[aria-label="빠른 전환 호출 방식"]');
    input.value = "keyboard";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await wait(page, () => JSON.parse(localStorage.getItem("moa-quick-switch-v1") ?? "null")?.trigger === "keyboard");
  check("quick-switch setting is stored locally", true);
  await page.goto(`${base}/demo/settings?tab=controls`, { settleMs: 200 });
  await wait(page, () => document.querySelector('[aria-label="빠른 전환 단축키"]')?.checkVisibility());
  check("local setting survives reload", await page.eval(() => document.querySelector('[aria-label="빠른 전환 호출 방식"]').value === "keyboard"));
  await page.eval(() => document.querySelector('[aria-label="설정 분류"] a[href$="tab=editor"]').click());
  await wait(page, () => location.search === "?tab=editor");
  await page.eval(() => history.back());
  await wait(page, () => location.search === "?tab=controls");
  check("Back restores the settings tab", await page.eval(() => document.querySelector('[aria-label="빠른 전환 단축키"]')?.checkVisibility()));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: settings fit the viewport`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check("no browser exceptions", page.consoleErrors.length === 0);
} finally {
  await browser.close();
  writeFileSync(`${output}/browser-checks.json`, JSON.stringify({
    condition: "Production build; isolated guest and synthetic sample session; shared settings UI only. This does not measure authenticated cache latency.", results,
  }, null, 2));
}
console.log(JSON.stringify({ checks: results.length, passed: true }));
process.exit(0);
