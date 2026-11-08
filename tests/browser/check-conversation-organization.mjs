import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const scenario = process.argv.find(value => value.startsWith("--scenario="))?.split("=")[1] ?? "browser";
assert.ok(["browser", "reports", "performance"].includes(scenario));
if (scenario !== "browser") assert.ok(process.argv.includes("--allow-live"), "Explicit --allow-live is required for a synthetic Gemini request.");
const base = process.argv.find(value => value.startsWith("--base="))?.slice(7) ?? "http://127.0.0.1:3034";
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "docs/verification/conversation-organization";
mkdirSync(output, { recursive: true });
const checks = [];
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, detail }); assert.ok(passed, name); };
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"] });
async function until(page, fn) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (await page.eval(`Boolean((${fn.toString()})())`)) return;
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  throw new Error("Organization UI did not reach expected state.");
}
async function click(page, selector) { await page.eval(selector => { const control = document.querySelector(selector); if (!control) throw new Error("Missing: " + selector); control.click(); }, selector); }
async function snapshot(page) { return page.eval(() => {
  const saved = Object.entries(sessionStorage).find(([key]) => key.startsWith("moa.sample.v1."))?.[1];
  return saved ? JSON.parse(saved) : null;
}); }
let result;
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  let requests = 0;
  await page.send("Network.enable");
  browser.on(page.sessionId, "Network.requestWillBeSent", event => { if (event.request.method === "POST" && Object.keys(event.request.headers).some(key => key.toLowerCase() === "next-action")) requests++; });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.sampleIO=[]; const open=IDBFactory.prototype.open; IDBFactory.prototype.open=function(...args){window.sampleIO.push('indexedDB'); return open.apply(this,args)}; window.showDirectoryPicker=()=>{window.sampleIO.push('picker');throw Error('sample isolation')};` });
  await page.goto(base + "/demo", { settleMs: 250 });
  await until(page, () => !!document.getElementById("message-draft"));
  check("same shared conversation workspace and production menu labels", await page.eval(() => !!document.querySelector('[data-conversation-workspace]') && [...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '/demo/files' && a.textContent.includes('폴더'))));
  check("84 documents with a closed materials drawer by default", await page.eval(() => document.querySelector('[aria-label="대화 자료 범위"]').textContent.includes("84개") && !document.getElementById('conversation-materials').open));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: conversation has no horizontal overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/chat-${width}.png`, format: "png", fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  const instruction = scenario === "performance" ? "웹사이트 성능 테스트 자료만 내용으로 찾아 성능 테스트 폴더에 모아 줘" : "10월달 보고서를 본문 작성일 기준으로 날짜별로 정리해 줘";
  await page.eval(() => document.getElementById('message-draft').focus());
  await page.send("Input.insertText", { text: instruction });
  check("no request before consent", await page.eval(() => document.querySelector('[data-action="organization-send"]').disabled) && requests === 0);
  await page.eval(() => { window.originalComposer = document.getElementById('message-draft'); });
  for (let i = 0; i < 10; i++) { await click(page, '[aria-controls="conversation-materials"]'); await until(page, () => document.getElementById('conversation-materials').open); await click(page, '[aria-label="자료 창 닫기"]'); await until(page, () => !document.getElementById('conversation-materials').open); }
  check("ten panel toggles preserve composer identity and draft", await page.eval(instruction => document.getElementById('message-draft') === window.originalComposer && document.getElementById('message-draft').value === instruction, instruction));
  await click(page, '[data-organization-consent]');
  check("explicit request/scope consent enables send", await page.eval(() => !document.querySelector('[data-action="organization-send"]').disabled));
  await page.eval(() => document.getElementById('message-draft').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
  check("composing Enter never submits a request", requests === 0);
  if (scenario === "browser") {
    await page.eval(() => document.getElementById('message-draft').focus());
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8, text: "\r" });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
    check("Shift+Enter inserts a newline without submitting", await page.eval(() => document.getElementById('message-draft').value.includes('\n')) && requests === 0);
    await page.send("Input.insertText", { text: " 범위 변경" });
    check("editing intent invalidates previous consent", await page.eval(() => document.querySelector('[data-action="organization-send"]').disabled));
    await click(page, '[aria-controls="conversation-materials"]');
    await until(page, () => document.getElementById('conversation-materials').open);
    await click(page, '[aria-label="팀 공유 폴더 열기"]');
    await click(page, '[aria-label="업무 폴더 열기"]');
    check("sample tree uses shared folder/file rows and navigates nested folders", await page.eval(() => !!document.querySelector('[data-sample-id="report-1002"] input') && !!document.querySelector('[data-sample-folder]')));
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check("reduced motion is honored", await page.eval(() => matchMedia('(prefers-reduced-motion: reduce)').matches && [...document.querySelectorAll('*')].every(node => [...node.getAnimations()].every(animation => animation.playState !== 'running'))));
    check("zero API requests during browsing and composing", requests === 0);
    check("zero real file picker or IndexedDB access", await page.eval(() => window.sampleIO.length === 0));
    check("no browser exceptions", page.consoleErrors.length === 0, page.consoleErrors);
  } else {
    const before = await snapshot(page);
    const start = performance.now();
    await click(page, '[data-action="organization-send"]');
    await until(page, () => !!document.querySelector('[data-action="sample-apply"]') || document.body.innerText.includes('요청 안내'));
    const latencyMs = Math.round(performance.now() - start);
    result = await snapshot(page);
    writeFileSync(`${output}/${scenario}-result.json`, JSON.stringify({ at: new Date().toISOString(), buildId: readFileSync('apps/web/.next/BUILD_ID','utf8').trim(), latencyMs, requests, state: result,
      notice: await page.eval(() => document.body.innerText.includes('요청 안내') ? document.body.innerText.slice(-1200) : null) }, null, 2));
    check("actual content-grounded Gemini plan reaches review", result?.phase === "review" && !!result.organization);
    const expected = JSON.parse(readFileSync('tests/fixtures/classification/organization-expectations.json','utf8')).scenarios[scenario === 'reports' ? 0 : 1];
    check("model matches the intended content-only document IDs", JSON.stringify([...result.selected].sort()) === JSON.stringify([...expected.matchedIds].sort()), result.selected);
    check("original positions stay unchanged before explicit approval", JSON.stringify(result.locations) === JSON.stringify(before.locations));
    check("request and composer remain mounted during plan changes", await page.eval(() => window.originalComposer === document.getElementById('message-draft')));
    check("exactly one model Action and no automatic retries", requests === 1);
    await page.screenshot({ path: `${output}/${scenario}-review-1440.png`, format: 'png', fullPage: true });
    await click(page, '[data-action="sample-apply"]');
    await until(page, () => document.body.innerText.includes('자료 정리 완료'));
    const applied = await snapshot(page);
    check("only matched documents move after approval", Object.entries(applied.locations).every(([id, location]) => result.selected.includes(id) ? location === result.targets[id] : location === before.locations[id]));
    await page.goto(base + '/demo', { settleMs: 200 });
    await until(page, () => document.body.innerText.includes('자료 정리 완료'));
    check("refresh keeps chat and results without model replay", requests === 1 && JSON.stringify((await snapshot(page)).locations) === JSON.stringify(applied.locations));
    await click(page, '[data-action="sample-undo"]');
    check("undo restores positions and removes newly proposed folders", JSON.stringify((await snapshot(page)).locations) === JSON.stringify(before.locations) && (await snapshot(page)).createdFolders.length === 0);
    check("zero sample access to real folder APIs", await page.eval(() => window.sampleIO.length === 0));
    check("no browser exceptions", page.consoleErrors.length === 0, page.consoleErrors);
    result = { latencyMs, usage: result.organization.usage, selected: result.selected };
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/${scenario}-checks.json`, JSON.stringify({ checks, result }, null, 2));
}
console.log(JSON.stringify({ scenario, checks: checks.length, result }, null, 2));
