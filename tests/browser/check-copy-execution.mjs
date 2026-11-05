import assert from 'node:assert/strict';
import { finishSourceSetup, waitForVisibleAction } from '../fixtures/finish-source-setup.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';
const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/copy-execution/browser';
mkdirSync(out, { recursive: true });
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
const checks = [];
let page;
const check = (name, passed, detail) => { checks.push({ name, passed, detail }); assert.ok(passed, `${name}: ${JSON.stringify(detail)}`); };
async function wait(fn) {
  for (let n = 0; n < 500; n++) { if (await page.eval(fn)) return; await new Promise(r => setTimeout(r, 30)); }
  throw Error(await page.eval(() => document.body.innerText));
}
async function click(label) {
  if (await revealSelectionControl(page, label)) return;
  await waitForVisibleAction(page, label);
  const point = await page.eval(label => {
    const el = [...document.querySelectorAll('button,summary,input[type="checkbox"]')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label || el.closest('label')?.textContent.trim() === label) && el.getClientRects().length && !el.disabled);
    if (!el) throw Error(`Missing ${label}`); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(base + '/files', { settleMs: 250 });
  await click('폴더 연결 관리'); await click('폴더 연결');
  await finishSourceSetup(page);
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  for (const name of ['읽기 안내.md', '할 일.txt']) await click(`${name} 선택`);
  await click('복사');
  await choosePlanDestination(page, click, '빈 폴더');
  await click('계획 만들기'); await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
  check('review identifies the unapplied plan before execution', await page.eval(() => document.querySelector('[aria-label="변경 계획 결과"]').textContent.includes('아직 적용하지 않았습니다')));
  await click('복사 전 검사'); await wait(() => document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === 'ready');
  check('inspection has zero writes', await page.eval(() => listingProbe.productWrites === 0));
  check('inspection step hides destination inputs', await page.eval(() => !document.querySelector('[aria-label="목적지 지정"]') && document.querySelector('[data-plan-phase]').dataset.workStep === '2'));
  await click('이 계획대로 복사');
  await wait(() => ['completed', 'error', 'cancelled'].includes(document.querySelector('[data-copy-execution]')?.dataset.copyExecution));
  const state = await page.eval(() => ({ state: document.querySelector('[data-copy-execution]').dataset.copyExecution, text: document.querySelector('[data-copy-execution]').textContent }));
  check('copy completes in actual OPFS', state.state === 'completed', state);
  check('result step hides inspection and shows confirmation', await page.eval(() => !document.querySelector('[data-copy-inspection]') && [...document.querySelectorAll('dialog:modal button')].some(b => b.textContent === '확인')));
  check('completed copy separates reviewed plan from execution result', await page.eval(() => {
    const plan = document.querySelector('[aria-label="변경 계획 결과"]');
    return plan.querySelector('h3').textContent === '검토한 계획'
      && !plan.textContent.includes('아직 적용하지 않았습니다')
      && plan.textContent.includes('파일별 처리 결과는 복사 결과를 확인하세요');
  }));
  check('permission requested from user gesture', await page.eval(() => listingProbe.requestsActive.every(Boolean) && listingProbe.permissionRequests === 1));
  check('source sentinel unchanged', await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  const comparison = await page.eval(async () => {
    const destination = await listingProbe.a.getDirectoryHandle('빈 폴더');
    const files = [];
    for (const name of ['읽기 안내.md', '할 일.txt']) files.push((await (await listingProbe.a.getFileHandle(name)).getFile()).text().then(async original => original === await (await (await destination.getFileHandle(name)).getFile()).text()));
    const history = await destination.getDirectoryHandle('.moa-history'); let count = 0; for await (const e of history.values()) if (e.name.startsWith('moa-copy-')) count++;
    return { equal: (await Promise.all(files)).every(Boolean), count };
  });
  check('destination bytes and journal', comparison.equal && comparison.count === 6, comparison);
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(`copy result contained ${width}`, await page.eval(() => { const d = document.querySelector('[data-plan-phase]'); return d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= innerWidth; }));
    check(`completed plan is collapsed and confirmation visible ${width}`, await page.eval(() => {
      const d = document.querySelector('[data-plan-phase]'); d.scrollTop = 0;
      const plan = d.querySelector('details'), button = [...d.querySelectorAll('button')].find(b => b.textContent === '확인');
      const r = button.getBoundingClientRect(), bounds = d.getBoundingClientRect();
      return !plan.open && plan.querySelector('summary').textContent === '검토한 계획' && r.top >= bounds.top && r.bottom <= bounds.bottom;
    }));
    await page.screenshot({ path: `${out}/copy-result-${width}.png`, format: 'png' });
  }
  await click('확인'); await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready' && document.querySelector('[data-listing-phase] h2')?.textContent === '빈 폴더');
  check('confirmation closes modal and focuses destination listing', await page.eval(() => !document.querySelector('dialog:modal') && document.activeElement === document.querySelector('[data-listing-phase] h2')));
  await click('작업 기록'); await wait(() => document.querySelector('[data-history-phase]')?.dataset.historyPhase === 'ready');
  check('copy history displayed', await page.eval(() => document.querySelector('[aria-label="복사 작업 기록"]')?.textContent.includes('복사 완료 기록')));
  check('copy history details start collapsed', await page.eval(() => {
    const d = document.querySelector('[aria-label="복사 작업 기록"] ol > li > details'); return !d.open && !d.querySelector('ul').checkVisibility();
  }));
  await page.eval(async () => { await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: `${out}/copy-history-1920.png`, format: 'png' });
  await page.goto(base + '/files', { settleMs: 250 });
  await click('폴더 연결 관리');
  await click('다시 연결');
  await finishSourceSetup(page);
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await click('빈 폴더 폴더 열기'); await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await click('작업 기록'); await wait(() => document.querySelector('[data-history-phase]')?.dataset.historyPhase === 'ready');
  check('history survives reload and explicit reconnect', await page.eval(() => document.querySelector('[aria-label="복사 작업 기록"]')?.textContent.includes('복사 완료 기록')));
  await page.eval(() => document.querySelector('[aria-label="복사 작업 기록"] ol > li > details > summary').click());
  await click('현재 복사본 내용 대조'); await wait(() => document.querySelector('[data-copy-target-phase]')?.dataset.copyTargetPhase === 'ready');
  check('current copy content matches after reconnect', await page.eval(() => document.querySelector('[data-copy-target-phase]').textContent.match(/현재 내용 일치/g)?.length === 2));
  check('reconnect/read does not write', await page.eval(() => listingProbe.productWrites === 0));
  await click('작업 기록 닫기'); await click('상위 폴더');
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('검증 자료 A');
      await root.getDirectoryHandle('용량 검증', { create: true });
      for (let n = 1; n <= 4; n++) {
        const handle = await root.getFileHandle(`용량-${n}.bin`, { create: true }), stream = await handle.createWritable();
        await stream.write(new Uint8Array(16 * 1024 * 1024).fill(n)); await stream.close();
      }
    } finally { listingProbe.preparing = false; }
  });
  await click('새로고침'); await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  for (let n = 1; n <= 4; n++) await click(`용량-${n}.bin 선택`);
  await click('복사');
  await choosePlanDestination(page, click, '용량 검증');
  await click('계획 만들기'); await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
  await click('복사 전 검사'); await wait(() => document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === 'ready');
  const started = performance.now(); await click('이 계획대로 복사');
  await wait(() => ['completed', 'error', 'cancelled'].includes(document.querySelector('[data-copy-execution]')?.dataset.copyExecution));
  check('4 x 16MiB maximum byte batch completes', await page.eval(() => document.querySelector('[data-copy-execution]').dataset.copyExecution === 'completed'), { elapsedMs: performance.now() - started });
  check('maximum byte batch preserves source and copies expected content', await page.eval(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('검증 자료 A'), to = await root.getDirectoryHandle('용량 검증');
    for (let n = 1; n <= 4; n++) {
      const fromFile = await (await root.getFileHandle(`용량-${n}.bin`)).getFile(), toFile = await (await to.getFileHandle(`용량-${n}.bin`)).getFile();
      if (fromFile.size !== 16 * 1024 * 1024 || toFile.size !== fromFile.size) return false;
      const a = new Uint8Array(await crypto.subtle.digest('SHA-256', await fromFile.arrayBuffer()));
      const b = new Uint8Array(await crypto.subtle.digest('SHA-256', await toFile.arrayBuffer()));
      if (!a.every((v, i) => b[i] === v)) return false;
    }
    return true;
  }));
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  writeFileSync(`${out}/checks.json`, JSON.stringify(checks, null, 2));
  await browser.close();
}
console.log(`${checks.length} copy browser checks passed`);
