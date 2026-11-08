import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const output = "docs/verification/workspace-details";
mkdirSync(output, { recursive: true });
const results = [], timings = [];
const check = (name, passed) => { results.push({ name, passed: !!passed }); assert.ok(passed, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"] });
const wait = async (page, predicate) => { for (let i = 0; i < 150; i++) { if (await page.eval(`Boolean((${predicate.toString()})())`)) return; await pause(40); } throw Error("Settings/loading UI not ready"); };
const click = (page, selector) => page.eval(selector => { const node = document.querySelector(selector); node.focus(); node.click(); }, selector);
const key = async (page, key, code, modifiers = 0) => { for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key, code, modifiers }); };
let delayedPage;
const paused = [];
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3034/demo", { settleMs: 250 });
  await page.goto("http://127.0.0.1:3034/demo/settings?tab=controls", { settleMs: 300 });
  await wait(page, () => document.querySelector('[aria-label="빠른 전환 단축키"]')?.checkVisibility());
  let rsc = 0, posts = 0;
  await page.send("Network.enable");
  browser.on(page.sessionId, "Network.requestWillBeSent", event => {
    if (event.request.url.includes("_rsc=") || Object.keys(event.request.headers).some(key => key.toLowerCase() === "rsc")) rsc++;
    if (event.request.method === "POST") posts++;
  });
  await page.eval(() => { window.originalSettingsInput = document.querySelector('[aria-label="빠른 전환 단축키"]'); });
  for (let round = 0; round < 3; round++) for (const tab of ["account", "folders", "editor", "controls"]) {
    const elapsed = await page.eval(async tab => {
      const start = performance.now();
      document.querySelector('[aria-label="설정 분류"] a[href$="tab=' + tab + '"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - start;
    }, tab);
    check(`round${round} ${tab}: URL and visible panel agree`, await page.eval(tab => new URL(location.href).searchParams.get('tab') === tab && document.querySelector('[aria-label="설정 분류"] [aria-current="page"]').href.endsWith('tab=' + tab) && document.querySelector('section[aria-label="' + ({ account: '계정과 로그인', folders: '자료 폴더와 복구 보관함', editor: '문서 편집', controls: '화면과 조작' })[tab] + '"]').checkVisibility(), tab));
    timings.push({ round, tab, elapsedMs: Math.round(elapsed * 10) / 10 });
  }
  await pause(150);
  check("tab changes make zero RSC/auth POST requests", rsc === 0 && posts === 0);
  check("hidden settings panels retain their DOM and need no fake loading", await page.eval(() => document.querySelector('[aria-label="빠른 전환 단축키"]') === window.originalSettingsInput && !document.querySelector('[data-navigation-loading]')));
  await page.eval(() => history.back());
  await wait(page, () => document.querySelector('[aria-label="설정 분류"] [aria-current="page"]').href.endsWith('tab=editor'));
  check("Back restores the previous tab", true);
  await page.eval(() => history.forward());
  await wait(page, () => document.querySelector('[aria-label="설정 분류"] [aria-current="page"]').href.endsWith('tab=controls'));
  check("Forward restores the next tab", true);
  await page.goto("http://127.0.0.1:3034/demo/settings?tab=controls", { settleMs: 250 });
  check("F5-equivalent document reload restores URL tab", await page.eval(() => document.querySelector('[aria-label="빠른 전환 단축키"]').checkVisibility()));
  await page.eval(() => document.querySelector('[aria-label="빠른 전환 단축키"]').focus());
  await key(page, "J", "KeyJ", 3);
  check("arbitrary Ctrl+Alt+J input saves", await page.eval(() => document.querySelector('[aria-label="빠른 전환 단축키"]').value === 'Ctrl+Alt+J'));
  await page.eval(() => document.querySelector('[aria-label="빠른 전환 단축키"]').focus());
  await key(page, "Escape", "Escape");
  check("Escape cancels shortcut recording", await page.eval(() => document.querySelector('[aria-label="빠른 전환 단축키"]').value === 'Ctrl+Alt+J'));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 }); await pause(80);
    check(`${width}: settings fit viewport`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/settings-${width}.png`, format: "png", fullPage: true });
  }
  delayedPage = await browser.newPage({ width: 1440, height: 1000 });
  browser.on(delayedPage.sessionId, "Fetch.requestPaused", event => { paused.push(event.requestId); });
  await delayedPage.send("Fetch.enable", { patterns: [{ urlPattern: "*127.0.0.1:3034/demo/files*", requestStage: "Request" }] });
  await delayedPage.goto("http://127.0.0.1:3034/demo/settings?tab=controls", { settleMs: 250 });
  await click(delayedPage, '[data-workspace-sidebar] nav a[href="/demo/files"]');
  await wait(delayedPage, () => document.querySelector('[data-navigation-loading]'));
  check("real delayed Link navigation shows central dim loading", await delayedPage.eval(() => {
    const overlay = document.querySelector('[data-navigation-loading]');
    const panel = overlay.firstElementChild.getBoundingClientRect();
    const style = getComputedStyle(overlay);
    return style.position === 'fixed' && style.backgroundColor.includes('0.4') && Math.abs(panel.x + panel.width / 2 - innerWidth / 2) < 2 && Math.abs(panel.y + panel.height / 2 - innerHeight / 2) < 2 && !!overlay.querySelector('[role="status"][aria-busy="true"]');
  }));
  await pause(180);
  await delayedPage.screenshot({ path: `${output}/central-loading.png`, format: "png" });
  await delayedPage.send("Fetch.disable");
  await wait(delayedPage, () => location.pathname === '/demo/files' && !document.querySelector('[data-navigation-loading]'));
  check("loading disappears when navigation completes", true);
  check("no settings or loading browser exceptions", page.consoleErrors.length === 0 && delayedPage.consoleErrors.length === 0);
} finally {
  if (delayedPage) await delayedPage.send("Fetch.disable").catch(() => {});
  await browser.close();
  writeFileSync(`${output}/settings-loading-checks.json`, JSON.stringify({ condition: "Actual Next production sample route; shared real SettingsTabs; delayed local RSC to observe overlay; no account/API mutation", results, timings }, null, 2));
}
console.log(JSON.stringify({ checks: results.length, timings: timings.length, passed: true }));
