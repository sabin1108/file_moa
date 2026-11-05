import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3000';
const out = process.argv[3] || 'docs/verification/shared-folder-connection';
mkdirSync(out, { recursive: true });
const checks = [];
const timing = [];
const network = [];
const consoleErrors = [];
const visualFindings = [];
const browser = await Browser.launch();
const region = '[aria-label="자료 폴더 연결 설정"]';
const row = 'section[aria-label="자료 폴더 연결"]';
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, detail }); assert.ok(passed, `${name}: ${JSON.stringify(detail)}`); };
const wait = async (page, fn) => { for (let n = 0; n < 80; n++) { if (await page.eval(fn)) return; await new Promise(resolve => setTimeout(resolve, 75)); } throw new Error(`Timeout: ${fn}`); };
const click = async (page, label) => {
  // Open real connection settings through its modal trigger on /files.
  if (await page.eval(() => location.pathname === '/files' && !document.querySelector('dialog')?.open)) {
    const rect = await page.eval(() => {
      const summary = document.querySelector('button[aria-haspopup="dialog"]');
      summary.scrollIntoView({ block: 'center' });
      const r = summary.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
  }
  const rect = await page.eval(label => {
    const el = [...document.querySelectorAll('button')].find(el => el.textContent === label && el.getClientRects().length);
    if (!el || el.disabled) return null;
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  assert.ok(rect, `Button unavailable: ${label}`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
};
const manage = async page => {
  if (await page.eval(() => location.pathname === '/files' && !document.querySelector('dialog')?.open)) {
    await page.eval(() => document.querySelector('button[aria-haspopup="dialog"]').click());
    await wait(page, () => !!document.querySelector('dialog[open] [aria-label="자료 폴더 연결 설정"]'));
  }
};
const idle = page => wait(page, () => !document.querySelector('[aria-label="자료 폴더 연결 설정"] [data-state="pending"]'));
const state = async page => { await manage(page); return page.eval(row => ({ name: document.querySelector(row)?.querySelector('h3').textContent, status: document.querySelector(row)?.querySelector('span').textContent, text: document.querySelector('[aria-label="자료 폴더 연결 설정"]')?.textContent }), row); };
const navigate = async (page, path) => {
  if (await page.eval(() => !!document.querySelector('dialog[open]'))) await click(page, '닫기');
  await page.eval(path => {
    const link = [...document.querySelectorAll('a')].find(el => el.getAttribute('href') === path && el.getClientRects().length);
    if (!link) throw new Error(`Missing link: ${path}`);
    link.click();
  }, path);
  for (let n = 0; n < 80; n++) {
    if (await page.eval(path => location.pathname === path, path)) return;
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error(`Navigation timeout: ${path}`);
};

// Runs only in isolated test profiles. Native permission prompts are NOT covered.
function installProbe(options) {
  window.probe = { mode: 'success', permission: 'granted', name: '검증 자료 A', calls: [], reads: 0, failWrite: false, failRemove: false, failRead: !!options.failRead, holds: [] };
  window.showDirectoryPicker = async function (options) {
    const p = window.probe;
    p.calls.push({ method: 'picker', mode: options.mode, active: navigator.userActivation.isActive });
    if (p.mode === 'cancel') throw new DOMException('synthetic dismissal', 'AbortError');
    if (p.mode === 'hold') await new Promise(resolve => p.holds.push(resolve));
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(p.name, { create: true });
  };
  FileSystemHandle.prototype.queryPermission = async function (options) {
    window.probe.calls.push({ method: 'query', mode: options.mode }); return window.probe.permission;
  };
  FileSystemHandle.prototype.requestPermission = async function (options) {
    window.probe.calls.push({ method: 'request', mode: options.mode, active: navigator.userActivation.isActive }); return window.probe.permission;
  };
  const put = IDBObjectStore.prototype.put, remove = IDBObjectStore.prototype.delete, get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.put = function (...args) { if (this.name === 'connections' && window.probe.failWrite) throw new DOMException('synthetic quota', 'QuotaExceededError'); return put.apply(this, args); };
  IDBObjectStore.prototype.delete = function (...args) { if (this.name === 'connections' && window.probe.failRemove) throw new Error('synthetic remove failure'); return remove.apply(this, args); };
  IDBObjectStore.prototype.get = function (...args) {
    if (this.name === 'connections') {
      window.probe.reads++;
      if (window.probe.failRead) throw new Error('synthetic read failure');
    }
    return get.apply(this, args);
  };
  if (options.unsupported) window.showDirectoryPicker = undefined;
}

const open = async (options = {}, width = 1440) => {
  const page = await browser.newPage({ width, height: 1000 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installProbe.toString()})(${JSON.stringify(options)})` });
  await page.send('Network.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', e => network.push({ url: e.request.url, method: e.request.method }));
  browser.on(page.sessionId, 'Runtime.consoleAPICalled', e => { if (e.type === 'error') consoleErrors.push(e.args.map(arg => arg.value ?? arg.description ?? '').join(' ')); });
  await page.goto(base + '/settings', { settleMs: 350 });
  await idle(page);
  return page;
};
const stored = page => page.eval(async () => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('moa-settings-development-v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try { return await new Promise((resolve, reject) => { const tx = db.transaction('connections'); const request = tx.objectStore('connections').getAll(); tx.oncomplete = () => resolve(request.result.map(handle => handle.name)); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
});
const capture = async (page, name, width) => {
  await page.setViewport({ width, height: 1000 });
  await manage(page);
  const dimensions = await page.eval(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, buttons: [...document.querySelectorAll('[aria-label="자료 폴더 연결 설정"] button')].map(el => ({ label: el.textContent, height: el.getBoundingClientRect().height })) }));
  // DOMRect can report 39.999969px for a computed 40px control; tolerate only subpixel float noise.
  check(`${name} ${width}: layout and button size`, !dimensions.overflow && dimensions.buttons.every(b => b.height + 0.001 >= (width <= 550 ? 44 : 40)), dimensions);
  await page.screenshot({ path: `${out}/${name}-${width}.png`, format: 'png', fullPage: true });
  if (name === 'connected') {
    const measured = await page.eval(probe);
    const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && f.id !== 'no-title' && f.id !== 'small-title');
    findings.push(...judgeApp(await page.eval(app), measured, { width }));
    visualFindings.push({ width, findings });
  }
};

try {
  const page = await open();
  check('initial disconnected; no permission request', (await state(page)).status === '미연결' && await page.eval(() => window.probe.calls.length === 0));
  await page.eval(async () => {
    const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('검증 자료 A', { create: true });
    const file = await dir.getFileHandle('unchanged.txt', { create: true }); const stream = await file.createWritable(); await stream.write('original synthetic content'); await stream.close();
  });
  await page.eval(() => { window.probe.mode = 'hold'; });
  await click(page, '폴더 연결');
  await wait(page, () => window.probe.holds.length === 1);
  check('pending blocks repeat actions and has explanatory status', await page.eval(() => [...document.querySelectorAll('[aria-label="자료 폴더 연결 설정"] button')].every(el => el.disabled) && document.querySelector('[aria-label="자료 폴더 연결 설정"]').textContent.includes('기다리고')));
  check('one pending selection opens only one picker', await page.eval(() => window.probe.calls.filter(c => c.method === 'picker').length === 1));
  await navigate(page, '/files');
  await manage(page);
  check('pending selection survives route change and blocks duplicate actions in files', await page.eval(() => {
    const region = document.querySelector('[aria-label="자료 폴더 연결 설정"]');
    return !!region?.querySelector('[data-state="pending"]') && [...region.querySelectorAll('button')].every(button => button.disabled);
  }));
  await page.eval(() => window.probe.holds.shift()()); await idle(page);
  check('connect saves real handle, read mode and activation', (await state(page)).status === '연결됨' && (await stored(page)).includes('검증 자료 A') && await page.eval(() => window.probe.calls[0].active && window.probe.calls.every(c => c.mode === 'read')));
  const callsBeforeNavigation = await page.eval(() => window.probe.calls.length);
  const readsBeforeNavigation = await page.eval(() => window.probe.reads);
  await navigate(page, '/settings');
  await navigate(page, '/files');
  await wait(page, () => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  const navigationCalls = await page.eval(start => window.probe.calls.slice(start), callsBeforeNavigation);
  check('files shares connection with read-only queries, no permission request/picker/storage reload', (await state(page)).status === '연결됨' && (await state(page)).name === '검증 자료 A' && navigationCalls.every(call => call.method === 'query' && call.mode === 'read') && await page.eval(() => window.probe.reads) === readsBeforeNavigation, navigationCalls);
  await navigate(page, '/settings');
  check('settings return retains the same connection', (await state(page)).status === '연결됨');
  await page.eval(() => { window.probe.mode = 'cancel'; }); await click(page, '다른 폴더 선택'); await idle(page);
  check('cancel retains previous folder and shows attention', (await state(page)).name === '검증 자료 A' && (await state(page)).text.includes('마치지 않았'));
  await page.eval(() => { window.probe.mode = 'success'; window.probe.permission = 'denied'; window.probe.name = '검증 자료 B'; });
  await click(page, '다른 폴더 선택'); await idle(page);
  check('denied selection retains previous connection', (await state(page)).name === '검증 자료 A' && (await state(page)).text.includes('허용하지 못'));
  await page.eval(() => { window.probe.permission = 'granted'; window.probe.failWrite = true; });
  await click(page, '다른 폴더 선택'); await idle(page);
  check('storage failure preserves old name and stored handle', (await state(page)).name === '검증 자료 A' && (await state(page)).text.includes('처리에 실패') && (await stored(page)).includes('검증 자료 A'));
  await navigate(page, '/files');
  check('storage error and prior connection are shared with files', (await state(page)).name === '검증 자료 A' && (await state(page)).text.includes('처리에 실패'));
  await page.eval(() => { window.probe.failWrite = false; });
  await click(page, '다른 폴더 선택'); await idle(page);
  check('replacement succeeds only after persistence', (await state(page)).name === '검증 자료 B' && (await stored(page)).includes('검증 자료 B'));
  // 실제 설정에는 가짜 기본 탭/이름 입력이 없다. 기존 IME·시안 탭 검사를 제품 검증으로 세지 않는다.
  check('settings has no simulated profile inputs or tabs', await page.eval(() => !document.querySelector('[aria-label="자료 폴더 연결 설정"] input, [aria-label="자료 폴더 연결 설정"] select, textarea') && !document.querySelector('[aria-label="설정 영역"]')));
  await page.goto(base + '/files', { settleMs: 350 }); await idle(page);
  check('reload restores handle as needs-permission without automatic query/request', (await state(page)).status === '다시 연결 필요' && await page.eval(() => window.probe.calls.length === 0));
  await page.eval(() => { window.probe.permission = 'denied'; }); await click(page, '다시 연결'); await idle(page);
  check('reconnect denial keeps name and retry', (await state(page)).status === '다시 연결 필요' && (await state(page)).name === '검증 자료 B');
  await capture(page, 'denied', 1440); await capture(page, 'denied', 390);
  await page.eval(() => { window.probe.permission = 'granted'; document.querySelector('section[aria-label="자료 폴더 연결"] button').focus(); });
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await idle(page);
  check('keyboard reconnect has user activation and read mode', (await state(page)).status === '연결됨' && await page.eval(() => window.probe.calls.filter(c => c.method === 'request').every(c => c.active && c.mode === 'read')));
  await page.eval(() => { window.probe.failRemove = true; }); await click(page, '연결 해제'); await idle(page);
  check('failed removal stops memory but keeps retry and disables new selection', (await state(page)).status === '미연결' && (await stored(page)).includes('검증 자료 B') && await page.eval(() => document.querySelector('section[aria-label="자료 폴더 연결"] button').disabled && document.querySelector('[aria-label="자료 폴더 연결 설정"]').textContent.includes('연결 해제 다시 시도')));
  await navigate(page, '/settings');
  check('disconnect failure follows navigation and still blocks reselection', (await state(page)).status === '미연결' && (await state(page)).text.includes('연결 해제 다시 시도') && await page.eval(() => document.querySelector('section[aria-label="자료 폴더 연결"] button').disabled));
  await capture(page, 'remove-failed', 390);
  await page.eval(() => { window.probe.failRemove = false; }); await click(page, '연결 해제 다시 시도'); await idle(page);
  check('removal retry deletes only stored reference and keeps original file', (await stored(page)).length === 0 && await page.eval(async () => {
    const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('검증 자료 A'); const f = await dir.getFileHandle('unchanged.txt'); return (await (await f.getFile()).text()) === 'original synthetic content';
  }));
  await navigate(page, '/files');
  check('files reflects removal retried from settings', (await state(page)).status === '미연결');
  await page.eval(() => { window.probe.name = '긴_자료폴더_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_한글자료이름이길어져도줄바꿈으로확인합니다'; });
  await click(page, '폴더 연결'); await idle(page);
  for (const width of [1440, 1920, 768, 390]) await capture(page, 'connected', width);
  await page.setViewport({ width: 1440, height: 900 });
  const routeTimes = [];
  const sharedReadCount = await page.eval(() => window.probe.reads);
  const sharedPermissionCount = await page.eval(() => window.probe.calls.length);
  await page.send('Performance.enable');
  const routeHeapBefore = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
  for (let n = 0; n < 10; n++) {
    const start = performance.now();
    await navigate(page, '/');
    await navigate(page, '/settings');
    await navigate(page, '/files');
    routeTimes.push(performance.now() - start);
    check(`route roundtrip ${n + 1}: connection retained through chat`, (await state(page)).status === '연결됨');
  }
  const routeHeapAfter = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
  check('route roundtrips do not reload handles or ask permission', await page.eval(() => window.probe.reads) === sharedReadCount && await page.eval(() => window.probe.calls.length) === sharedPermissionCount);
  checks.push({ name: 'shared route journey measurement', passed: true, detail: { routeTimes, routeHeapBefore, routeHeapAfter, garbageCollectionForced: false, note: 'Ten files-chat-settings-files loops; wall time includes automation and route polling; no native picker wait.' } });
  await page.eval(() => history.back());
  await wait(page, () => location.pathname === '/settings');
  check('browser back preserves connection', (await state(page)).status === '연결됨');
  await page.eval(() => history.forward());
  await wait(page, () => location.pathname === '/files');
  check('browser forward preserves connection', (await state(page)).status === '연결됨');
  await page.send('Performance.enable');
  const heapBefore = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
  for (let n = 0; n < 10; n++) {
    await manage(page);
    await page.eval(() => {
      window.feedbackStart = performance.now();
      const observer = new MutationObserver(() => {
        if (!document.querySelector('dialog[open]')) { window.feedbackDuration = performance.now() - window.feedbackStart; observer.disconnect(); }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await click(page, '다른 폴더 선택'); await idle(page);
    timing.push(await page.eval(() => window.feedbackDuration));
  }
  const heapAfter = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value;
  checks.push({ name: 'repeated selection measurement (not native user wait)', passed: true, detail: { timing, heapBefore, heapAfter, garbageCollectionForced: false } });
  const savedBeforeExit = await stored(page);
  const readsBeforeExit = await page.eval(() => window.probe.reads);
  await page.eval(() => { window.probe.mode = 'hold'; window.probe.name = '이탈 후 늦은 폴더'; }); await click(page, '다른 폴더 선택');
  await wait(page, () => window.probe.holds.length === 1);
  await navigate(page, '/preview');
  await page.eval(() => { if (window.probe?.holds.length) window.probe.holds.shift()(); });
  await new Promise(resolve => setTimeout(resolve, 150));
  check('leaving workspace stops late selection and preview does not read handles', JSON.stringify(await stored(page)) === JSON.stringify(savedBeforeExit) && await page.eval(() => window.probe.reads) === readsBeforeExit && page.consoleErrors.length === 0);
  await navigate(page, '/settings'); await idle(page);
  check('return from preview starts a new lifecycle needing explicit permission', (await state(page)).status === '다시 연결 필요' && (await state(page)).name === savedBeforeExit[0]);
  await page.close();

  const failed = await open({ failRead: true });
  check('preload error does not show disconnected actions', !(await state(failed)).status && (await state(failed)).text.includes('불러오지 못'));
  await navigate(failed, '/files');
  check('preload failure is shared in files with retry', !(await state(failed)).status && (await state(failed)).text.includes('불러오지 못'));
  await failed.eval(() => { window.probe.failRead = false; }); await click(failed, '다시 불러오기'); await idle(failed);
  check('preload retry restores without permission request', (await state(failed)).status === '다시 연결 필요' && await failed.eval(() => window.probe.calls.length === 0));
  await failed.close();
  const unsupported = await open({ unsupported: true });
  check('unsupported browser offers explanation without false connection', !(await state(unsupported)).status && (await state(unsupported)).text.includes('사용할 수 없'));
  await capture(unsupported, 'unsupported', 390); await unsupported.close();
  check('no external or mutating HTTP requests', network.every(r => (r.url.startsWith(base) || r.url.startsWith('data:')) && r.method === 'GET'), network.filter(r => !r.url.startsWith(base) || r.method !== 'GET'));
  check('no React hydration or console errors', consoleErrors.length === 0, consoleErrors);
  console.log(JSON.stringify({ passed: checks.length, failed: checks.filter(c => !c.passed).length }));
} finally {
  await browser.close();
  writeFileSync(`${out}/browser-checks.json`, JSON.stringify({ at: new Date().toISOString(), base, boundary: 'Real settings and files UI, shared workspace navigation, IndexedDB, Web Locks and OPFS; injected picker/permission/failures; NOT native permission dialog, external source folder or real login verification', fixture: 'Synthetic OPFS directories and one sentinel text file; deterministic names; no random seed; core regression set, no holdout', checks, timing, visualFindings }, null, 2));
}
