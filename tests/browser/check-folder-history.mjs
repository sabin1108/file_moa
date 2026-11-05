import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
const out = process.argv[2] || 'docs/verification/folder-history/browser';
const base = process.argv[3] || 'http://127.0.0.1:3011';
mkdirSync(out, { recursive: true });
const checks = [], durations = [], targetDurations = [], browser = await Browser.launch();
let page;
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
async function wait(fn) { for (let i = 0; i < 240; i++) { if (await page.eval(fn)) return; await new Promise(r => setTimeout(r, 30)); } throw Error(`Timeout: ${await page.eval(() => document.body.innerText)}`); }
async function click(label) {
  if (await revealSelectionControl(page, label)) return;
  await page.eval(label => {
    const target = [...document.querySelectorAll('[data-history-phase] button')].find(e => e.getAttribute('aria-label') === label);
    const details = target?.closest('details');
    if (details && !details.open) details.querySelector('summary').click();
  }, label);
  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const e = [...root.querySelectorAll('button,summary,input[type=checkbox]')].find(e => (e.textContent.trim() === label || e.getAttribute('aria-label') === label) && e.getClientRects().length && !e.disabled);
    if (!e) throw Error(`Missing ${label}`);
    e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}
async function key(key, code) { for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code }); }
const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const historyReady = () => wait(() => document.querySelector('[data-history-phase]')?.dataset.historyPhase === 'ready');
async function open() { const start = performance.now(); await click('작업 기록'); await historyReady(); durations.push(performance.now() - start); }
try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(`${base}/files`, { settleMs: 300 });
  await click('폴더 연결 관리'); await click('폴더 연결'); await finishSourceSetup(page); await ready();
  await page.eval(() => { listingProbe.baseline = { writes: listingProbe.productWrites, permissions: listingProbe.permissionRequests }; });
  await open();
  check('missing history is empty', await page.eval(() => document.querySelector('dialog:modal').textContent.includes('표시할 생성 기록이 없어요')));
  check('empty read creates no directory and requests no permission', await page.eval(async () => {
    if (listingProbe.productWrites !== listingProbe.baseline.writes || listingProbe.permissionRequests !== listingProbe.baseline.permissions) return false;
    try { await listingProbe.a.getDirectoryHandle('.moa-history'); return false; } catch (e) { return e.name === 'NotFoundError'; }
  }));
  await key('Escape', 27); await wait(() => !document.querySelector('dialog:modal'));
  check('Escape restores opener focus', await page.eval(() => document.activeElement?.textContent === '작업 기록'));
  await click('＋ 새로 만들기');
  await page.eval(() => { const e = document.querySelector('[data-listing-phase] form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, '기록 확인.txt'); e.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('만들기'); await wait(() => document.querySelector('[data-listing-phase] form [role=status]')?.textContent.includes('빈 파일을')); await ready();
  await click('읽기 안내.md 선택');
  await page.eval(() => { listingProbe.baseline = { writes: listingProbe.productWrites, permissions: listingProbe.permissionRequests }; });
  await open();
  check('actual creation pair is grouped into one completed TXT', await page.eval(() => {
    const rows = document.querySelectorAll('[aria-label="작업 기록 목록"] > li'); return rows.length === 1 && ['기록 확인.txt', '완료 기록', 'TXT 파일'].every(s => rows[0].textContent.includes(s));
  }));
  check('creation record starts as one collapsed summary', await page.eval(() => {
    const d = document.querySelector('[aria-label="작업 기록 목록"] > li > details'); return !d.open && !d.querySelector('dl').checkVisibility() && getComputedStyle(d.querySelector('summary')).flexWrap === 'nowrap';
  }));
  await page.eval(() => document.querySelector('[aria-label="작업 기록 목록"] > li > details > summary').click());
  check('click expands creation details', await page.eval(() => document.querySelector('[aria-label="작업 기록 목록"] dl').checkVisibility()));
  await page.eval(() => document.querySelector('[aria-label="작업 기록 목록"] > li > details > summary').click());
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(r => setTimeout(r, 200));
    check(`dialog fits ${width}`, await page.eval(() => { const d = document.querySelector('dialog:modal'), r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= innerWidth; }));
    await page.screenshot({ path: `${out}/history-${width}.png`, format: 'png' });
  }
  for (let i = 0; i < 8; i++) { await key('Tab', 9); const focus = await page.eval(() => ({ tag: document.activeElement?.tagName, html: document.activeElement?.outerHTML.slice(0, 160), inModal: document.querySelector('dialog:modal').contains(document.activeElement), hasFocus: document.hasFocus() })); check(`keyboard cannot focus background controls ${i}: ${JSON.stringify(focus)}`, focus.inModal || focus.tag === 'BODY'); }
  await click('작업 기록 닫기');
  check('selected file survives history dialog', await page.eval(() => !!document.querySelector('[data-selected=true]')));
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const d = await listingProbe.a.getDirectoryHandle('.moa-history');
      const records = []; for await (const h of d.values()) records.push(JSON.parse(await (await h.getFile()).text()));
      listingProbe.historyTemplate = records[0];
      listingProbe.historySnapshot = JSON.stringify(records.sort((a, b) => a.status.localeCompare(b.status)));
      const payloads = [
        { ...records[0], id: 'pending-only', status: 'pending', path: ['진행 기록.md'], kind: 'md' },
        { ...records[0], id: 'foreign', owner: { userId: 'foreign', workspaceId: 'foreign' }, path: ['비공개 이름.txt'] },
        { ...records[0], id: 'markup', status: 'pending', path: ['<img src=x onerror=alert(1)>.txt'] },
      ];
      for (let i = 0; i < payloads.length; i++) { const h = await d.getFileHandle(`moa-folder-fixture-${i}.json`, { create: true }); const w = await h.createWritable(); await w.write(JSON.stringify(payloads[i])); await w.close(); }
    } finally { listingProbe.preparing = false; }
  });
  await open();
  check('pending is uncertain; foreign owner is excluded; markup is inert text', await page.eval(() => {
    const d = document.querySelector('dialog:modal'); return d.textContent.includes('결과 미확인') && d.textContent.includes('1개를 제외') && !d.textContent.includes('비공개 이름') && d.textContent.includes('<img src=x') && !d.querySelector('img');
  }));
  await page.eval(async () => { listingProbe.preparing = true; try { const d = await listingProbe.a.getDirectoryHandle('.moa-history'); const h = await d.getFileHandle('moa-folder-broken.json', { create: true }); const w = await h.createWritable(); await w.write('{broken'); await w.close(); } finally { listingProbe.preparing = false; } });
  await click('기록 새로고침'); await historyReady();
  check('corruption makes all shown outcomes uncertain', await page.eval(() => { const d = document.querySelector('dialog:modal'); return d.textContent.includes('잘못된 기록 1개') && !d.textContent.includes('완료 기록'); }));
  await page.eval(() => {
    listingProbe.targetBodyReads = 0;
    const getFile = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = function () { if (!listingProbe.preparing && ['기록 확인.txt', '진행 기록.md'].includes(this.name)) listingProbe.targetBodyReads++; return getFile.call(this); };
  });
  for (let run = 1; run <= 3; run++) {
    const start = performance.now();
    await click('기록 확인.txt 현재 상태 확인');
    await wait(() => !!document.querySelector('[data-target-phase="ready"]'));
    targetDurations.push({ run, ms: performance.now() - start, scenario: 'existing empty TXT; six journal files including malformed/foreign records' });
  }
  check('existing file is observed without changing uncertain record', await page.eval(() => {
    const row = document.querySelector('[data-target-phase="ready"]').closest('li');
    return row.textContent.includes('기록한 위치에 파일이 있어요') && row.textContent.includes('결과 미확인') && !row.textContent.includes('완료 기록') && listingProbe.targetBodyReads === 0;
  }));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 }); await new Promise(r => setTimeout(r, 200));
    await page.eval(() => { document.querySelector('dialog:modal').scrollTop = 0; });
    check(`target result fits ${width}`, await page.eval(() => { const d = document.querySelector('dialog:modal'); return d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth <= innerWidth; }));
    await page.screenshot({ path: `${out}/target-present-${width}.png`, format: 'png' });
  }
  await click('진행 기록.md 현재 상태 확인'); await wait(() => !!document.querySelector('[data-target-phase="ready"]'));
  check('missing target is a current observation, not a failed operation', await page.eval(() => document.querySelector('[data-target-phase="ready"]').textContent.includes('지금은 이 이름의 항목이 없어요')));
  await page.eval(async () => { listingProbe.preparing = true; try { await listingProbe.a.getDirectoryHandle('진행 기록.md', { create: true }); } finally { listingProbe.preparing = false; } });
  await click('진행 기록.md 현재 상태 확인'); await wait(() => !!document.querySelector('[data-target-phase="ready"]'));
  check('different actual kind is reported', await page.eval(() => document.querySelector('[data-target-phase="ready"]').textContent.includes('기록과 다른 종류의 폴더')));
  await page.eval(() => { listingProbe.permission = 'denied'; });
  await click('기록 확인.txt 현재 상태 확인'); await wait(() => !!document.querySelector('[data-target-phase="error"]'));
  check('target permission error clears prior observation', await page.eval(() => !document.querySelector('[data-target-phase="ready"]') && document.querySelector('[data-target-phase="error"]').textContent.includes('권한이 필요')));
  await page.eval(() => { listingProbe.permission = 'granted'; listingProbe.holdRead = true; });
  await click('기록 확인.txt 현재 상태 확인'); await wait(() => listingProbe.holds.length > 0);
  await click('기록 확인.txt 현재 상태 확인 취소');
  await page.eval(() => { listingProbe.holdRead = false; listingProbe.holds.splice(0).forEach(r => r()); });
  await new Promise(r => setTimeout(r, 150));
  check('target cancellation ignores late history revalidation', await page.eval(() => !!document.querySelector('[data-target-phase="cancelled"]') && !document.querySelector('[data-target-phase="ready"]')));
  await page.eval(async () => {
    listingProbe.preparing = true;
    try { const d = await listingProbe.a.getDirectoryHandle('.moa-history'); const h = await d.getFileHandle('moa-folder-fixture-0.json'); const value = JSON.parse(await (await h.getFile()).text()); value.path = ['변경된 경로.md']; const w = await h.createWritable(); await w.write(JSON.stringify(value)); await w.close(); }
    finally { listingProbe.preparing = false; }
  });
  await click('진행 기록.md 현재 상태 확인'); await wait(() => !!document.querySelector('[data-target-phase="error"]'));
  check('changed journal does not inspect a different path silently', await page.eval(() => document.querySelector('[data-target-phase="error"]').textContent.includes('기록이 바뀌었어요')));
  await click('기록 새로고침'); await historyReady();
  check('history refresh discards target results', await page.eval(() => !document.querySelector('[data-target-phase="ready"],[data-target-phase="error"]')));
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: `${out}/history-partial.png`, format: 'png' });
  await page.eval(() => { listingProbe.permission = 'denied'; }); await click('기록 새로고침');
  await wait(() => document.querySelector('[data-history-phase]')?.dataset.historyPhase === 'error');
  check('permission denial clears prior rows', await page.eval(() => !document.querySelector('[aria-label="작업 기록 목록"]') && document.querySelector('dialog:modal').textContent.includes('권한이 필요')));
  await page.eval(() => { listingProbe.permission = 'granted'; listingProbe.holdRead = true; });
  await click('기록 새로고침'); await wait(() => listingProbe.holds.length > 0);
  await click('기록 읽기 취소');
  await page.eval(() => { listingProbe.holdRead = false; listingProbe.holds.splice(0).forEach(r => r()); });
  await new Promise(r => setTimeout(r, 150));
  check('cancel ignores late enumeration', await page.eval(() => document.querySelector('[data-history-phase]')?.dataset.historyPhase === 'cancelled' && !document.querySelector('[aria-label="작업 기록 목록"]')));
  await click('기록 새로고침'); await historyReady();
  await click('작업 기록 닫기'); await click('하위 자료 폴더 열기'); await ready(); await open();
  check('nested location shows its own empty history', await page.eval(() => { const d = document.querySelector('dialog:modal'); return d.textContent.includes('검증 자료 A / 하위 자료') && d.textContent.includes('표시할 생성 기록이 없어요') && !d.textContent.includes('기록 확인.txt'); }));
  await click('작업 기록 닫기'); await click('상위 폴더'); await ready();
  await page.eval(() => { listingProbe.holdRead = true; }); await click('작업 기록'); await wait(() => listingProbe.holds.length > 0);
  await key('Escape', 27); await wait(() => !document.querySelector('dialog:modal'));
  await page.eval(() => { listingProbe.holdRead = false; listingProbe.holds.splice(0).forEach(r => r()); });
  await new Promise(r => setTimeout(r, 150));
  check('closed dialog stays closed after late response', await page.eval(() => !document.querySelector('[data-history-phase]')));
  check('all history flows made no writes or permission requests', await page.eval(() => listingProbe.productWrites === listingProbe.baseline.writes && listingProbe.permissionRequests === listingProbe.baseline.permissions));
  check('source sentinel bytes and metadata unchanged', await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  check('original journal records unchanged', await page.eval(async () => { listingProbe.preparing = true; try { const d = await listingProbe.a.getDirectoryHandle('.moa-history'); const records = []; for await (const h of d.values()) if (!h.name.includes('fixture') && !h.name.includes('broken')) records.push(JSON.parse(await (await h.getFile()).text())); return JSON.stringify(records.sort((a, b) => a.status.localeCompare(b.status))) === listingProbe.historySnapshot; } finally { listingProbe.preparing = false; } }));
  check('target checks never read target file metadata or contents', await page.eval(() => listingProbe.targetBodyReads === 0));
  await page.goto(`${base}/files`, { settleMs: 300 });
  await click('폴더 연결 관리');
  await wait(() => [...document.querySelectorAll('dialog:modal button')].some(b => b.textContent.trim() === '다시 연결'));
  check('reload requires explicit reconnect', await page.eval(() => listingProbe.permissionRequests === 0 && !document.querySelector('[data-history-phase]')));
  await click('다시 연결'); await finishSourceSetup(page); await ready();
  await page.eval(() => { listingProbe.baseline = { writes: listingProbe.productWrites, permissions: listingProbe.permissionRequests }; });
  await open(); await click('기록 확인.txt 현재 상태 확인'); await wait(() => !!document.querySelector('[data-target-phase="ready"]'));
  check('persisted record can be checked after explicit reconnect', await page.eval(() => document.querySelector('[data-target-phase="ready"]').textContent.includes('기록한 위치에 파일이 있어요')));
  check('post-reconnect observation adds no writes or permission requests', await page.eval(() => listingProbe.productWrites === listingProbe.baseline.writes && listingProbe.permissionRequests === listingProbe.baseline.permissions));
  check('no browser errors', page.consoleErrors.length === 0);
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify({ checks, openToReadyMs: durations, targetCheckMs: targetDurations, consoleErrors: page?.consoleErrors ?? [] }, null, 2));
  await browser.close();
}
console.log(`Folder history: ${checks.length} checks passed.`);
