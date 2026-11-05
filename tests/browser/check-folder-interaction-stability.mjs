import assert from 'node:assert/strict';
import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { probe as tasteProbe, app as tasteApp, layout as tasteLayout } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeApp, judgeLayout, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/folder-interaction-stability/after';
const baseline = process.argv.includes('--baseline');
mkdirSync(out, { recursive: true });
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
const checks = [], samples = [], visual = [];
let page;
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
async function wait(fn) { for (let n = 0; n < 300; n++) { if (await page.eval(fn)) return; await new Promise(r => setTimeout(r, 30)); } throw Error(`Timeout: ${fn}`); }
async function click(label) {
  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const e = [...root.querySelectorAll('button,input,summary')].find(e => !e.disabled && e.checkVisibility() && (e.textContent.trim() === label || e.getAttribute('aria-label') === label));
    if (!e) throw Error(`Missing ${label}`);
    e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}
const pickerReady = () => wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
async function probe(label) {
  // Sample actual painted-frame styles without awaiting animations (the old test did).
  const sample = await page.eval(async label => {
    const root = document.querySelector('dialog:modal');
    const button = [...root.querySelectorAll('button')].find(e => !e.disabled && e.checkVisibility() && (e.textContent.trim() === label || e.getAttribute('aria-label') === label));
    if (!button) throw Error(`Missing ${label}`);
    const input = root.querySelector('[aria-label="목적지 경로 직접 입력"] input');
    const start = performance.now(), frames = []; button.click();
    while (performance.now() - start < 350) {
      await new Promise(requestAnimationFrame);
      const picker = root.querySelector('[data-destination-phase]');
      const list = picker?.querySelector('[aria-busy]');
      frames.push({ t: performance.now() - start, top: root.getBoundingClientRect().top, listTop: list?.getBoundingClientRect().top,
        opacity: list ? Number(getComputedStyle(list).opacity) : 1, inputAlive: !input || input.isConnected,
        animations: root.getAnimations({ subtree: true }).filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)
          && (a.effect?.target === root || (list && a.effect?.target?.contains(list)))).length });
    }
    return { label, frames };
  }, label);
  samples.push(sample);
  if (!baseline) {
    check(`${label}: input retained`, sample.frames.every(f => f.inputAlive));
    check(`${label}: no whole-area fade or travel`, sample.frames.every(f => f.opacity === 1 && f.animations === 0));
    check(`${label}: dialog top stays fixed`, Math.max(...sample.frames.map(f => f.top)) - Math.min(...sample.frames.map(f => f.top)) < 1);
  }
}
try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(base + '/files', { settleMs: 250 }); await click('폴더 연결 관리'); await click('폴더 연결');
  await finishSourceSetup(page);
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await revealSelectionControl(page, '할 일.txt 선택');
  if (!baseline) {
    check('repeated checkbox toggles preserve every row position', await page.eval(async () => {
      const input = document.querySelector('[aria-label="읽기 안내.md 선택"]');
      const geometry = () => [...document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li')].map(e => { const r = e.getBoundingClientRect(); return [r.top, r.height]; });
      const before = JSON.stringify(geometry());
      for (let n = 0; n < 20; n++) { input.click(); await new Promise(requestAnimationFrame); if (before !== JSON.stringify(geometry())) return false; }
      return !input.checked;
    }));
  }
  await click('읽기 안내.md 선택'); await click('복사'); await probe('목적지 선택'); await pickerReady();
  for (let n = 0; n < 5; n++) {
    await probe('하위 자료 목적지 폴더 열기'); await pickerReady();
    await probe('상위 폴더'); await pickerReady();
  }
  if (!baseline) {
    await page.eval(() => { listingProbe.holdRead = true; window.stableInput = document.querySelector('[aria-label="목적지 경로 직접 입력"] input'); });
    await click('하위 자료 목적지 폴더 열기');
    await wait(() => listingProbe.holds.length > 0);
    await wait(() => document.querySelector('[data-destination-phase] [role="status"]')?.textContent.includes('확인하고'));
    check('slow navigation retains input and blocks stale selection', await page.eval(() => stableInput.isConnected && document.querySelector('[aria-label$="폴더를 목적지로 선택"]').disabled && [...document.querySelectorAll('[aria-label="목적지 하위 폴더"] button')].every(e => e.disabled)));
    await page.eval(() => { listingProbe.holdRead = false; listingProbe.holds.splice(0).forEach(resolve => resolve()); }); await pickerReady();
    await page.eval(() => { listingProbe.failRead = 'NotFoundError'; }); await click('상위 폴더');
    await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'error');
    check('failed navigation preserves previous listing with explicit error', await page.eval(() => document.querySelector('[data-destination-phase]').textContent.includes('이전에 확인한 목록') && document.querySelector('[aria-label$="폴더를 목적지로 선택"]').disabled));
    await click('목적지 다시 시도'); await pickerReady();
  }
  await click('하위 자료 목적지 폴더 열기'); await pickerReady();
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await page.eval(() => { document.querySelector('dialog:modal').scrollTop = 0; });
    check(`contained ${width}`, await page.eval(() => { const d = document.querySelector('dialog:modal'); return document.documentElement.scrollWidth <= innerWidth && d.scrollWidth <= d.clientWidth; }));
    await page.screenshot({ path: `${out}/picker-${width}.png`, format: 'png' });
    const metrics = await page.eval(tasteProbe);
    const findings = [...judge(metrics, { width, allow: [] }).filter(f => !APP_SKIP.has(f.id)),
      ...judgeLayout(await page.eval(tasteLayout), { width, allow: [] }), ...judgeApp(await page.eval(tasteApp), metrics, { width, allow: [] })];
    visual.push({ width, findings });
  }
  await click('하위 자료 폴더를 목적지로 선택'); await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
  await probe('복사 전 검사'); await wait(() => document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === 'ready');
  await click('목적지·계획 수정'); await click('계획 닫기');
  await click('이동'); await probe('목적지 선택'); await pickerReady();
  await probe('하위 자료 목적지 폴더 열기'); await pickerReady();
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape restores destination trigger', await page.eval(() => document.activeElement?.getAttribute('aria-label') === '목적지 선택'));
  await click('계획 닫기'); await click('전체 선택 해제'); await click('하위 자료 폴더 열기');
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await page.screenshot({ path: `${out}/parent-${width}.png`, format: 'png' });
  }
  check('no source writes', await page.eval(async () => listingProbe.productWrites === 0 && JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  check('no browser errors', page.consoleErrors.length === 0);
} finally {
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, samples, visual, errors: page?.consoleErrors }, null, 2));
  await browser.close();
}
console.log(`${checks.length} checks; ${samples.length} frame probes`);
