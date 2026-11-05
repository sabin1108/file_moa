import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3010';
const out = process.argv[3] || 'docs/verification/copy-inspection/browser';
mkdirSync(out, { recursive: true });
const checks = [], timings = [], visual = [], network = [];
const browser = await Browser.launch();
let page;
function check(name, passed, detail) { checks.push({ name, passed: !!passed, detail }); assert.ok(passed, `${name}: ${JSON.stringify(detail)}`); }
async function wait(fn, arg) {
  for (let n = 0; n < 500; n++) { if (await page.eval(fn, arg)) return; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw Error(`Timeout: ${fn}; ${await page.eval(() => document.body.innerText)}`);
}
async function click(label) {
  if (await revealSelectionControl(page, label)) return;
  const point = await page.eval(label => {
    const element = [...document.querySelectorAll('button,summary,input[type="checkbox"]')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label || el.closest('label')?.textContent.trim() === label) && el.getClientRects().length && !el.disabled);
    if (!element) throw Error(`Missing control ${label}`);
    element.scrollIntoView({ block: 'center' }); const rect = element.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}
async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
}
const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const phase = value => wait(value => value === 'idle' ? document.querySelector('[data-plan-phase]')?.dataset.workStep === '1' : document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === value, value);
async function destination(value) {
  if (await page.eval(() => document.querySelector('[data-plan-phase]')?.dataset.workStep === '2')) await click('목적지·계획 수정');
  await choosePlanDestination(page, click, value);
}
async function plan() {
  await click('복사');
  await destination('빈 폴더'); await generate();
}
async function generate() {
  await click(await page.eval(() => document.querySelector('[aria-label="변경 계획 결과"]') ? '계획 다시 확인' : '계획 만들기'));
  await wait(() => document.querySelector('[data-plan-phase]').dataset.planPhase === 'ready');
}
async function inspect() {
  const start = performance.now();
  await click(await page.eval(() => document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === 'ready' ? '파일 다시 검사' : '복사 전 검사'));
  await phase('ready'); return performance.now() - start;
}
async function capture(name, width) {
  await page.setViewport({ width, height: 1000 });
  await page.eval(() => { document.querySelector('[data-plan-phase]').scrollTop = 0; });
  check(`${name}/${width}: contained`, await page.eval(() => {
    const d = document.querySelector('[data-plan-phase]'); return d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= innerWidth && !document.querySelector('button button,button input,p div');
  }));
  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width }), ...judgeApp(await page.eval(app), measured, { width })].filter(f => !APP_SKIP.has(f.id) && !['no-title', 'small-title'].includes(f.id));
  visual.push({ name, width, findings });
  await page.screenshot({ path: `${out}/${name}-${width}.png`, format: 'png' });
}
function installProbe() {
  const p = window.listingProbe;
  p.workers = 0; p.activeWorkers = 0; p.holdHash = false; p.hashQueue = []; p.failBody = false; p.modes = [];
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    stopped = false;
    constructor(...args) { super(...args); p.workers++; p.activeWorkers++; }
    postMessage(...args) { if (p.holdHash) p.hashQueue.push(() => { if (!this.stopped) super.postMessage(...args); }); else super.postMessage(...args); }
    terminate() { if (!this.stopped) { this.stopped = true; p.activeWorkers--; } super.terminate(); }
  };
  for (const name of ['queryPermission', 'requestPermission']) {
    const original = FileSystemHandle.prototype[name];
    FileSystemHandle.prototype[name] = function (options) { p.modes.push(options?.mode); return original.call(this, options); };
  }
  const read = FileSystemFileHandle.prototype.getFile;
  FileSystemFileHandle.prototype.getFile = function () {
    if (p.failBody && !p.preparing) { p.failBody = false; throw new DOMException('fixture failure', 'NotReadableError'); }
    return read.call(this);
  };
  const create = FileSystemDirectoryHandle.prototype.getFileHandle;
  FileSystemDirectoryHandle.prototype.getFileHandle = function (name, options) { if (options?.create && !p.preparing) p.productWrites++; return create.call(this, name, options); };
  const remove = FileSystemDirectoryHandle.prototype.removeEntry;
  FileSystemDirectoryHandle.prototype.removeEntry = function (...args) { if (!p.preparing) p.productWrites++; return remove.apply(this, args); };
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();(${installProbe.toString()})();` });
  await page.send('Network.enable'); await page.send('Performance.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', event => network.push({ url: event.request.url, method: event.request.method }));
  await page.goto(base + '/files', { settleMs: 250 });
  await click('폴더 연결 관리'); await click('폴더 연결'); await finishSourceSetup(page); await ready();
  const names = ['읽기 안내.md', '할 일.txt', '지원하지 않는 사진.pdf'];
  for (const name of names) await click(`${name} 선택`);
  await plan();
  check('INSPECT-001 no body read or Worker before action', await page.eval(() => listingProbe.productBodyReads === 0 && listingProbe.workers === 0));
  timings.push({ name: 'three-files', ms: await inspect() });
  await click('기술 정보');
  const expected = names.map(name => createHash('sha256').update(`# ${name}\n개인정보 없는 합성 원문`).digest('hex'));
  const actual = await page.eval(() => [...document.querySelectorAll('[data-copy-inspection] code')].map(el => el.textContent));
  check('INSPECT-003 real Worker hashes equal independent Node SHA-256', expected.every(hash => actual.includes(hash)), actual);
  check('INSPECT-006 successful inspection offers a separate copy action', await page.eval(() => document.querySelector('[data-copy-inspection]').innerText.includes('검사 시점의 결과') && [...document.querySelectorAll('button')].some(el => el.textContent === '이 계획대로 복사' && !el.disabled)));
  check('INSPECT-005 one Worker released after whole batch', await page.eval(() => listingProbe.workers === 1 && listingProbe.activeWorkers === 0));
  for (const width of [1440, 1920, 768, 390]) await capture('complete', width);
  await page.eval(() => [...document.querySelectorAll('button')].find(b => b.textContent === '이 계획대로 복사').focus());
  await key('Tab', 'Tab', 9);
  check('INSPECT-005 last copy action participates in modal focus wrap', await page.eval(() => document.activeElement.textContent === '계획 닫기'));
  await key('Tab', 'Tab', 9, 8);
  check('INSPECT-005 reverse wrap reaches copy action', await page.eval(() => document.activeElement.textContent === '이 계획대로 복사'));
  await click('기술 정보');
  await page.eval(() => { listingProbe.holdHash = true; }); await click('파일 다시 검사');
  await wait(() => listingProbe.hashQueue.length > 0); await capture('loading', 390);
  await click('검사 취소'); await phase('idle');
  check('INSPECT-005 cancel immediately terminates Worker and focuses stage title', await page.eval(() => listingProbe.activeWorkers === 0 && document.activeElement.tagName === 'H2' && document.querySelector('[data-plan-phase]').contains(document.activeElement)));
  await page.eval(() => { listingProbe.holdHash = false; listingProbe.hashQueue.splice(0).forEach(release => release()); });
  await inspect();
  await destination('하위 자료');
  check('INSPECT-005 edited destination removes old inspection', await page.eval(() => !document.querySelector('[data-copy-inspection]')));
  await destination('빈 폴더'); await generate();
  await page.eval(() => { listingProbe.failBody = true; }); await click('복사 전 검사'); await phase('error'); await capture('read-error', 390);
  await inspect();
  check('INSPECT-005 error retry finishes actual read', await page.eval(() => document.querySelector('[data-copy-inspection]').innerText.includes('검사 완료 · 3개')));
  await page.eval(async () => {
    listingProbe.preparing = true;
    try { const target = await listingProbe.a.getDirectoryHandle('빈 폴더'); await target.getFileHandle('읽기 안내.md', { create: true }); }
    finally { listingProbe.preparing = false; }
  });
  await click('파일 다시 검사'); await phase('error');
  check('INSPECT-002 conflict created after plan is detected', await page.eval(() => document.querySelector('[data-copy-inspection]').innerText.includes('목적지에 충돌')));
  await page.eval(async () => {
    listingProbe.preparing = true;
    try { const target = await listingProbe.a.getDirectoryHandle('빈 폴더'); await target.removeEntry('읽기 안내.md'); }
    finally { listingProbe.preparing = false; }
  });
  await inspect();
  await page.eval(() => { listingProbe.holdHash = true; }); await click('파일 다시 검사'); await wait(() => listingProbe.hashQueue.length > 0);
  await key('Escape', 'Escape', 27);
  check('INSPECT-005 Escape cancels and restores selection trigger', await page.eval(() => listingProbe.activeWorkers === 0 && document.activeElement.textContent === '복사'));
  await page.eval(() => { listingProbe.holdHash = false; listingProbe.hashQueue.splice(0).forEach(release => release()); });
  await plan(); await page.eval(() => { listingProbe.permission = 'denied'; }); await click('복사 전 검사');
  await wait(() => !document.querySelector('[data-plan-phase]').open);
  check('INSPECT-005 permission loss updates shared connection', await page.eval(() => document.body.innerText.includes('다시 연결이 필요')));
  await click('폴더 연결 관리'); await page.eval(() => { listingProbe.permission = 'granted'; }); await click('다시 연결'); await finishSourceSetup(page); await ready();
  const heapBefore = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')?.value;
  await plan();
  const repeats = [];
  for (let i = 0; i < 10; i++) repeats.push(await inspect());
  const heapAfter = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')?.value;
  timings.push({ name: 'ten-inspections', samplesMs: repeats, heapBefore, heapAfter, caveat: 'main-thread JS heap without forced GC; excludes Worker/native memory' });
  check('INSPECT-005 repeated inspections release every Worker', await page.eval(() => listingProbe.activeWorkers === 0));
  await click('계획 닫기');
  // Exact quantity and byte boundaries in isolated OPFS, with real Worker digest work.
  for (const [count, size, label] of [[100, 0, '100-empty'], [4, 16 * 1024 * 1024, '64MiB'], [1, 16 * 1024 * 1024 + 1, 'over-limit']]) {
    await page.eval(async ({ count, size, label }) => {
      listingProbe.preparing = true;
      try {
        const dir = await listingProbe.a.getDirectoryHandle(label, { create: true });
        const bytes = new Uint8Array(size);
        for (let n = 0; n < count; n++) {
          const file = await dir.getFileHandle(`sample-${n}.bin`, { create: true });
          const stream = await file.createWritable(); await stream.write(bytes); await stream.close();
        }
      } finally { listingProbe.preparing = false; }
    }, { count, size, label });
    await click('새로고침'); await ready(); await click(`${label} 폴더 열기`); await ready();
    await click('표시된 파일 전체 선택'); await plan();
    if (label === 'over-limit') {
      const workers = await page.eval(() => listingProbe.workers);
      await click('복사 전 검사'); await phase('error');
      check('INSPECT-004 limit rejected before Worker content read', await page.eval(workers => listingProbe.workers === workers && document.querySelector('[data-copy-inspection]').innerText.includes('한도를 넘었어요'), workers));
    } else {
      const samples = []; for (let n = 0; n < 3; n++) samples.push(await inspect());
      timings.push({ name: label, count, bytes: count * size, samplesMs: samples });
      await click('기술 정보');
      const expectedHash = createHash('sha256').update(new Uint8Array(size)).digest('hex');
      check(`INSPECT-003/004 ${label} exact hashes and count`, await page.eval(({ count, expectedHash }) => {
        const hashes = [...document.querySelectorAll('[data-copy-inspection] code')]; return hashes.length === count && hashes.every(el => el.textContent === expectedHash);
      }, { count, expectedHash }));
    }
    await click('계획 닫기'); await click('상위 폴더'); await ready();
  }
  const sentinel = await page.eval(async () => ({ before: listingProbe.before, after: await listingProbe.sentinel(), writes: listingProbe.productWrites, modes: listingProbe.modes, activeWorkers: listingProbe.activeWorkers }));
  check('INSPECT-007 source sentinel unchanged', JSON.stringify(sentinel.before) === JSON.stringify(sentinel.after));
  check('INSPECT-007 no product writes or write permission', sentinel.writes === 0 && sentinel.modes.every(mode => mode === 'read'), sentinel);
  check('INSPECT-007 no uploads or external requests', network.every(request => request.method === 'GET' && request.url.startsWith(base)), network.filter(request => request.method !== 'GET' || !request.url.startsWith(base)));
  check('INSPECT-005 no Worker left alive', sentinel.activeWorkers === 0);
  check('browser console clean', page.consoleErrors.length === 0, page.consoleErrors);
  writeFileSync(`${out}/result.json`, JSON.stringify({ checks, timings, visual, network, errors: page.consoleErrors }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, passed: checks.every(c => c.passed), timings }));
} catch (error) {
  writeFileSync(`${out}/failure.json`, JSON.stringify({ error: String(error), checks, timings, visual, errors: page?.consoleErrors }, null, 2));
  throw error;
} finally { await browser.close(); }
