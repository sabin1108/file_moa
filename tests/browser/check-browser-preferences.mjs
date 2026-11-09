import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3035";
const output = resolve(process.argv[3] ?? "docs/verification/browser-boundary-improvement/browser/preferences");
mkdirSync(output, { recursive: true });
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
const checks = [];
const selector = '[aria-label="빠른 전환 호출 방식"]';
const check = (name, pass) => { checks.push({ name, pass: !!pass }); assert.ok(pass, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(page, predicate) {
  for (let index = 0; index < 240; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;
    await pause(40);
  }
  throw new Error("Preference fixture timeout: " + predicate);
}
async function set(page, value) {
  await page.eval(({ selector, value }) => {
    const control = document.querySelector(selector);
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, { selector, value });
}
try {
  const first = await browser.newPage({ width: 1440, height: 1000 });
  await first.goto(base + "/demo", { settleMs: 250 });
  await first.goto(base + "/demo/settings?tab=controls", { settleMs: 350 });
  const second = await browser.newPage({ width: 1440, height: 1000 });
  await second.goto(base + "/demo/settings?tab=controls", { settleMs: 350 });
  for (const page of [first, second]) await until(page, () => document.querySelector('[aria-label="빠른 전환 호출 방식"]')?.checkVisibility());
  await set(first, "keyboard");
  await until(second, () => document.querySelector('[aria-label="빠른 전환 호출 방식"]').value === "keyboard");
  check("a real storage event updates the other tab", await first.eval(selector => document.querySelector(selector).value === "keyboard", selector));
  await set(second, "off");
  await until(first, () => document.querySelector('[aria-label="빠른 전환 호출 방식"]').value === "off");
  check("cross-tab synchronization works in both directions", true);
  await first.eval(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "moa-quick-switch-v1") throw new DOMException("Fixture blocked preference write", "SecurityError");
      return original.call(this, key, value);
    };
  });
  await set(first, "hold");
  await until(first, () => document.body.innerText.includes("설정을 이 탭에 적용했지만 저장하지 못했어요"));
  check("blocked writes apply in this tab with a visible warning", await first.eval(selector => document.querySelector(selector).value === "hold", selector));
  check("an unsaved fallback does not change another tab", await second.eval(selector => document.querySelector(selector).value === "off", selector));
  await set(second, "both");
  await pause(200);
  check("an external write does not discard this tab's unsaved setting", await first.eval(selector => document.querySelector(selector).value === "hold", selector));
  await first.goto(base + "/demo/settings?tab=controls", { settleMs: 350 });
  await until(first, () => document.querySelector('[aria-label="빠른 전환 호출 방식"]')?.value === "both");
  check("reload reads the actual persisted setting", true);
  await first.eval(() => document.querySelector('[aria-label="빠른 전환 열기"]').click());
  await until(first, () => document.querySelector('[data-quick-switch-menu]'));
  check("the explicit callback opens this tab's menu", await first.eval(() => document.querySelector('[data-quick-switch-menu]').dataset.quickMode === "click"));
  check("a UI request never opens the other tab's menu", !await second.eval(() => document.querySelector('[data-quick-switch-menu]')));
  await first.eval(() => document.querySelector('[aria-label="빠른 전환 닫기"]').click());
  await first.setViewport({ width: 390, height: 844 });
  check("settings remain contained on a narrow viewport", await first.eval(() => document.documentElement.scrollWidth <= innerWidth));
  await first.screenshot({ path: resolve(output, "preferences-390.png"), format: "png" });
  check("neither tab has a browser exception", first.consoleErrors.length === 0 && second.consoleErrors.length === 0);
} finally {
  await browser.close();
  writeFileSync(resolve(output, "checks.json"), JSON.stringify({ checks, condition: "Actual production sample settings, two isolated-profile Chromium pages sharing native storage events; blocked writes affect only the test page; no personal accounts, files, database migration or model request." }, null, 2));
}
console.log(JSON.stringify({ checks: checks.length, passed: true }));
