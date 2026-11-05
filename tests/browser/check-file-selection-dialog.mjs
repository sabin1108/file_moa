import { finishSourceSetup, waitForVisibleAction } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl, settleHistoryReturn } from '../fixtures/reveal-file-tools.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3006';
const out = process.argv[3] || 'docs/verification/file-selection-dialog/browser';
mkdirSync(out, { recursive: true });
const checks = [], timing = [], visual = [], network = [];
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
let page;
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, detail }); assert.ok(passed, `${name}: ${JSON.stringify(detail)}`); };
async function wait(fn, arg) {
  for (let n = 0; n < 160; n++) { if (await page.eval(fn, arg)) return; await new Promise(done => setTimeout(done, 50)); }
  throw Error(`Timeout: ${fn}`);
}
async function click(label) {
  if (await revealSelectionControl(page, label)) return;
  await waitForVisibleAction(page, label);
  const rect = await page.eval(label => {
    const el = [...document.querySelectorAll('button,input[type="checkbox"]')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label || el.closest('label')?.textContent.trim() === label) && el.getClientRects().length && !el.disabled);
    if (!el) throw Error(`Missing control: ${label}`);
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...rect, button: 'left', clickCount: 1 });
  await settleHistoryReturn(page, label);
}
async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers, ...(type === 'keyDown' && key === 'Enter' ? { text: '\r' } : {}) });
}
const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const idle = () => wait(() => !document.querySelector('[aria-label="자료 폴더 연결 설정"] [data-state="pending"]'));
const count = () => page.eval(() => document.querySelector('[aria-label="파일 선택"] [role="status"]')?.textContent);
async function manage() {
  await click('폴더 연결 관리');
  await wait(() => document.querySelector('dialog')?.open);
  await page.eval(() => Promise.all(document.querySelector('dialog').getAnimations().map(animation => animation.finished)));
}
async function close() { await click('폴더 연결 관리 닫기'); await wait(() => !document.querySelector('dialog').open); }
async function navigate(path) {
  await page.eval(path => [...document.querySelectorAll('a')].find(el => el.getAttribute('href') === path && el.getClientRects().length).click(), path);
  await wait(path => location.pathname === path, path);
}
async function capture(label, width) {
  await page.setViewport({ width, height: 1000 });
  await page.eval(() => scrollTo(0, 0));
  check(`${label}/${width}: no overflow and semantic interactive nesting`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && !document.querySelector('button button,button input,button a,a button,p div')));
  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && !['no-title', 'small-title'].includes(f.id));
  findings.push(...judgeApp(await page.eval(app), measured, { width }));
  visual.push({ label, width, findings });
  await page.screenshot({ path: `${out}/${label}-${width}.png`, format: 'png', fullPage: true });
}
function deferredPicker() {
  const original = window.showDirectoryPicker;
  window.selectionProbe = { hold: false, gates: [] };
  window.showDirectoryPicker = async (...args) => {
    if (selectionProbe.hold) await new Promise(done => selectionProbe.gates.push(done));
    return original(...args);
  };
}
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();(${deferredPicker.toString()})();` });
  await page.send('Network.enable'); browser.on(page.sessionId, 'Network.requestWillBeSent', e => network.push(e.request.url));
  await page.goto(base + '/files', { settleMs: 250 });
  check('DIALOG-001 no automatic popup; labelled settings trigger', await page.eval(() => !document.querySelector('dialog').open && !!document.querySelector('button[aria-haspopup="dialog"] svg')));
  await manage();
  check('DIALOG-002 modal has name, safe title focus and native modal state', await page.eval(() => {
    const d = document.querySelector('dialog'); return d.matches(':modal') && d.contains(document.activeElement) && document.activeElement.tagName === 'H2' && document.getElementById(d.getAttribute('aria-labelledby')).textContent === '폴더 연결 관리';
  }));
  for (let n = 0; n < 10; n++) await key('Tab', 'Tab', 9);
  check('DIALOG-002 Tab remains inside modal', await page.eval(() => document.querySelector('dialog').contains(document.activeElement)));
  await page.eval(() => document.querySelector('[aria-label="주 메뉴"] a')?.focus());
  check('DIALOG-002 background cannot receive programmatic focus', await page.eval(() => document.querySelector('dialog').contains(document.activeElement)));
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
  check('DIALOG-002 backdrop click does not dismiss settings', await page.eval(() => document.querySelector('dialog').open));
  await key('Escape', 'Escape', 27); await wait(() => !document.querySelector('dialog').open);
  check('DIALOG-002 Escape restores trigger focus', await page.eval(() => document.activeElement === document.querySelector('button[aria-haspopup="dialog"]')));
  await manage(); await page.eval(() => { listingProbe.pickerMode = 'cancel'; }); await click('폴더 연결'); await idle();
  check('DIALOG-003 picker cancel keeps popup and error context', await page.eval(() => document.querySelector('dialog').open && document.querySelector('dialog').textContent.includes('마치지 않았')));
  await page.eval(() => { listingProbe.pickerMode = 'success'; listingProbe.failWrite = true; }); await click('폴더 연결'); await idle();
  check('DIALOG-003 save failure keeps popup', await page.eval(() => document.querySelector('dialog').open && document.querySelector('dialog').textContent.includes('실패')));
  await page.eval(() => { listingProbe.failWrite = false; }); await click('폴더 연결'); await finishSourceSetup(page); await ready(); await wait(() => !document.querySelector('dialog').open);
  check('DIALOG-003 explicit setup finish closes popup and preserves files route', await page.eval(() => location.pathname === '/files' && document.activeElement === document.querySelector('button[aria-haspopup="dialog"]')));
  await click('읽기 안내.md 선택'); await click('지원하지 않는 사진.pdf 선택');
  check('SELECT-001 file extensions selectable; no directory checkbox', await count() === '2개 선택' && await page.eval(() => !document.querySelector('[aria-label="하위 자료 선택"]') && listingProbe.productBodyReads === 0));
  check('SELECT-002 master checkbox is mixed', await page.eval(() => { const all = document.querySelector('[aria-label="파일 선택"] input'); return all.indeterminate && !all.checked; }));
  await page.eval(() => document.querySelector('[aria-label="회의 메모.md 선택"]').focus()); await key(' ', 'Space', 32);
  check('SELECT-001 Space toggles a focused native checkbox', await count() === '3개 선택');
  await click('표시된 파일 전체 선택');
  check('SELECT-002 select all counts six displayed files, not two folders', await count() === '6개 선택' && await page.eval(() => { const all = document.querySelector('[aria-label="파일 선택"] input'); return all.checked && !all.indeterminate; }));
  await click('선택 해제'); check('SELECT-003 clear selection resets master state', await count() === '0개 선택');
  await click('읽기 안내.md 선택'); await click('읽기 안내.md 미리보기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready'); await click('목록으로 돌아가기');
  check('SELECT-004 preview preserves selection and return focus', await count() === '1개 선택' && await page.eval(() => document.activeElement.getAttribute('aria-label') === '읽기 안내.md 미리보기'));
  for (let n = 0; n < 10; n++) { await navigate('/settings'); await navigate('/files'); await ready(); }
  check('SELECT-004 ten route roundtrips preserve selection', await count() === '1개 선택');
  for (const width of [1440, 1920, 768, 390]) await capture('selected', width);
  await manage();
  for (const width of [1440, 768, 390]) await capture('dialog', width);
  await close();
  await click('하위 자료 폴더 열기'); await ready();
  check('SELECT-004 changing folder clears prior selection', await count() === '0개 선택');
  await click('하위 문서.txt 선택'); await click('상위 폴더'); await ready();
  check('SELECT-004 parent navigation clears child selection', await count() === '0개 선택');
  await click('회의 메모.md 선택');
  await page.eval(() => { listingProbe.failRead = 'NotReadableError'; }); await click('새로고침'); await wait(() => document.querySelector('[data-listing-phase]').dataset.listingPhase === 'error');
  check('SELECT-005 failure retains selection but disables additions', await count() === '1개 선택' && await page.eval(() => [...document.querySelectorAll('[aria-label="파일과 하위 폴더"] input')].every(input => input.disabled)));
  await click('선택 해제'); check('SELECT-005 clear remains available after failure', await count() === '0개 선택');
  await click('다시 시도'); await ready(); await click('회의 메모.md 선택');
  await page.eval(async () => { listingProbe.preparing = true; try { await listingProbe.a.removeEntry('회의 메모.md'); } finally { listingProbe.preparing = false; } });
  await click('새로고침'); await ready(); check('SELECT-005 successful refresh prunes absent selected files', await count() === '0개 선택');
  await click('읽기 안내.md 선택'); await page.eval(() => { listingProbe.permission = 'denied'; }); await click('새로고침');
  await wait(() => document.body.innerText.includes('다시 연결이 필요'));
  check('DIALOG-004 permission loss stays visible without forced popup', await page.eval(() => !document.querySelector('dialog').open) && await count() === '1개 선택');
  await manage(); await page.eval(() => { listingProbe.permission = 'granted'; }); await click('다시 연결'); await finishSourceSetup(page); await ready();
  check('SELECT-006 reconnect revalidates and preserves existing selection', await count() === '1개 선택');
  await manage(); await page.eval(() => { selectionProbe.hold = true; }); await click('다른 폴더 선택'); await wait(() => selectionProbe.gates.length === 1);
  await close(); await manage();
  await page.eval(() => { selectionProbe.hold = false; selectionProbe.gates.splice(0).forEach(done => done()); }); await idle(); await ready();
  check('DIALOG-003 old completion cannot close a reopened popup; replacement clears selection', await page.eval(() => document.querySelector('dialog').open) && await count() === '0개 선택');
  await close(); await manage(); await page.eval(() => { selectionProbe.hold = true; listingProbe.failWrite = true; }); await click('다른 폴더 선택'); await wait(() => selectionProbe.gates.length === 1);
  await close(); await page.eval(() => { selectionProbe.hold = false; selectionProbe.gates.splice(0).forEach(done => done()); });
  await wait(() => document.body.innerText.includes('연결 처리에 실패'));
  check('DIALOG-003 late failure never reopens a dismissed popup', await page.eval(() => !document.querySelector('dialog').open && location.pathname === '/files'));
  await page.eval(() => { listingProbe.failWrite = false; }); await click('새로고침'); await ready();
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await manage(); check('DIALOG-005 reduced motion removes popup and selection transitions', await page.eval(() => getComputedStyle(document.querySelector('dialog')).transitionDuration === '0s' && [...document.querySelectorAll('[data-selected]')].every(el => getComputedStyle(el).transitionDuration === '0s')));
  await close(); await page.send('Emulation.setEmulatedMedia', { features: [] });
  for (const entries of [100, 1000, 1001]) {
    await page.eval(async entries => {
      listingProbe.preparing = true;
      try { const folder = await listingProbe.a.getDirectoryHandle(`선택 ${entries}`, { create: true }); for (let i = 0; i < entries; i++) await folder.getFileHandle(`파일-${String(i).padStart(4, '0')}.txt`, { create: true }); }
      finally { listingProbe.preparing = false; }
    }, entries);
    await click('새로고침'); await ready(); await click(`선택 ${entries} 폴더 열기`); await ready();
    const samples = [];
    for (let n = 0; n < 3; n++) {
      const start = performance.now(); await click('표시된 파일 전체 선택');
      await wait(count => document.querySelector('[aria-label="파일 선택"] [role="status"]').textContent === `${count.toLocaleString('ko-KR')}개 선택`, Math.min(entries, 1000));
      samples.push(performance.now() - start); await click('선택 해제');
    }
    check(`SELECT-002 ${entries} dataset selects only bounded displayed files`, await page.eval(entries => document.querySelectorAll('[aria-label="파일과 하위 폴더"] input').length === Math.min(entries, 1000), entries));
    timing.push({ entries, samplesMs: samples, viewport: '390x1000', boundary: 'CDP click + React commit + DOM polling; not INP; synthetic OPFS filenames, no body reading during selection' });
    await click('상위 폴더'); await ready();
  }
  await click('읽기 안내.md 선택'); await manage(); await page.eval(() => { listingProbe.failRemove = true; }); await click('연결 해제'); await idle();
  check('SELECT-006 failed disconnect still clears selections and retains retry dialog', await page.eval(() => document.querySelector('dialog').open && !document.querySelector('[aria-label="파일 선택"]') && document.querySelector('dialog').textContent.includes('연결 해제 다시 시도')));
  const sentinel = await page.eval(async () => ({ before: listingProbe.before, after: await listingProbe.sentinel(), writes: listingProbe.productWrites }));
  check('source sentinel untouched; product writes zero', JSON.stringify(sentinel.before) === JSON.stringify(sentinel.after) && sentinel.writes === 0, sentinel);
  check('no external requests or console errors', network.every(url => url.startsWith(base) || url.startsWith('data:')) && page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  writeFileSync(`${out}/checks.json`, JSON.stringify({ at: new Date().toISOString(), base, checks, timing, visual, consoleErrors: page?.consoleErrors, boundary: 'Real UI/state/IDB/Web Locks/OPFS; injected picker/permission/failure; synthetic files only; no native picker or real login validation' }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, failures: checks.filter(c => !c.passed), timing, findings: visual.filter(v => v.findings.length) }, null, 2));
  await browser.close();
}
