import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3014';
const out = process.argv[3] || 'docs/verification/workflow-ux/restore-resume';
mkdirSync(out, { recursive: true });
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
const checks = [];
let page;
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  assert.ok(passed, name);
}
async function wait(predicate) {
  for (let i = 0; i < 600; i++) {
    if (await page.eval(predicate)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('Timeout: ' + predicate);
}
async function click(label) {
  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const button = [...root.querySelectorAll('button,summary')].find(el => el.checkVisibility() && !el.disabled && (el.textContent.trim() === label || el.getAttribute('aria-label') === label));
    if (!button) throw Error('Missing enabled button: ' + label);
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}
try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(base + '/files', { settleMs: 350 });
  await click('폴더 연결 관리');
  await wait(() => [...document.querySelectorAll('button')].some(el => el.textContent === '폴더 연결' && !el.disabled));
  check('app permission guide is visible without triggering a picker or permission request', await page.eval(() => !!document.querySelector('[aria-label="폴더 접근 안내"]') && listingProbe.permissionRequests === 0));
  await page.eval(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.eval(() => Promise.all(document.querySelector('dialog:modal').getAnimations().map(animation => animation.finished)));
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.screenshot({ path: `${out}/permission-guide-${width}.png`, format: 'png' });
    check(`permission guide contained ${width}`, await page.eval(() => document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth));
  }
  await click('폴더 연결');
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await page.eval(() => { listingProbe.name = '검증 자료 A'; });
  await click('새 보관함 만들기');
  await click('만들 위치 선택');
  await wait(() => document.body.textContent.includes('생성 위치: 검증 자료 A'));
  await wait(() => [...document.querySelectorAll('button')].some(el => el.checkVisibility() && !el.disabled && el.textContent.trim() === '이 위치에 보관함 생성'));
  await click('이 위치에 보관함 생성');
  await wait(() => document.body.textContent.includes('위치·식별 확인됨'));
  await click('복구 보관함 보기');
  await wait(() => document.querySelector('[data-archive-phase]')?.dataset.archivePhase === 'ready');
  check('empty connected vault is shown honestly inside settings', await page.eval(() => document.querySelector('[data-archive-phase]').textContent.includes('아직 보관된 복구 사본이 없습니다')));
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('nested archive Escape retains settings and restores its trigger', await page.eval(() => document.querySelectorAll('dialog:modal').length === 1 && document.activeElement.textContent === '복구 보관함 보기'));
  await click('폴더 연결 관리 닫기');
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const parent = await listingProbe.a.getDirectoryHandle('하위 자료');
      const target = await parent.getFileHandle('읽기 안내.md', { create: true });
      const stream = await target.createWritable();
      await stream.write('r'.repeat(16 * 1024 * 1024));
      await stream.close();
      listingProbe.targetSnapshot = async () => {
        const file = await target.getFile();
        return { size: file.size, mtime: file.lastModified, body: await file.text() };
      };
      listingProbe.targetBefore = await listingProbe.targetSnapshot();
      listingProbe.productWrites = 0;
    } finally { listingProbe.preparing = false; }
  });
  await revealSelectionControl(page, '읽기 안내.md 선택');
  await click('복사');
  await choosePlanDestination(page, click, '하위 자료');
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
  check('copy execution stays blocked for conflict', await page.eval(() => ![...document.querySelectorAll('button')].some(el => el.textContent === '복사 전 검사')));
  await click('충돌 파일 검사');
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'ready');
  check('inspection has no writes', await page.eval(() => listingProbe.productWrites === 0));
  check('new and existing files are compared honestly', await page.eval(() => document.body.textContent.includes('새 파일 · 유지') && document.body.textContent.includes('기존 목적지 파일 · 백업 대상') && document.body.textContent.includes('두 파일의 내용이 다릅니다')));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 180));
    await page.eval(() => { document.querySelector('dialog:modal').scrollTop = 0; });
    check(`no overflow ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth));
    check(`comparison labels use panel width ${width}`, await page.eval(() => [...document.querySelectorAll('[data-backup-phase] dt')].every(el => el.getBoundingClientRect().width > 150)));
    await page.screenshot({ path: `${out}/review-${width}.png`, format: 'png' });
  }
  await click('기존 파일의 복구 사본 만들기');
  await wait(() => ['completed','error','cancelled'].includes(document.querySelector('[data-backup-phase]')?.dataset.backupPhase));
  check('actual backup completed', await page.eval(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'completed'));
  check('result identifies a verified backup without promising replacement', await page.eval(() => document.body.textContent.includes('복구 사본 검증됨') && document.body.textContent.includes('기존 파일은 그대로입니다')));
  check('source unchanged', await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  check('old destination unchanged', await page.eval(async () => JSON.stringify(await listingProbe.targetSnapshot()) === JSON.stringify(listingProbe.targetBefore)));
  check('vault contains the old destination bytes and paired verified journal', await page.eval(async () => {
    let vault;
    for await (const entry of listingProbe.a.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) vault = entry;
    let operation;
    for await (const entry of vault.values()) if (entry.kind === 'directory' && entry.name.startsWith('moa-backup-')) operation = entry;
    const prepared = JSON.parse(await (await (await operation.getFileHandle('prepared.json')).getFile()).text());
    const payload = await (await operation.getFileHandle(prepared.items[0].recoveryId + '.bin')).getFile();
    const history = await (await listingProbe.a.getDirectoryHandle('하위 자료')).getDirectoryHandle('.moa-history');
    const paired = await history.getDirectoryHandle(operation.name);
    const left = await (await (await operation.getFileHandle('item-0001-verified.json')).getFile()).text();
    const right = await (await (await paired.getFileHandle('item-0001-verified.json')).getFile()).text();
    return await payload.text() === listingProbe.targetBefore.body && left === right;
  }));
  await page.screenshot({ path: `${out}/completed.png`, format: 'png' });
  await click('계획 닫기');
  await page.eval(() => {
    const get = FileSystemFileHandle.prototype.getFile;
    listingProbe.archivePayloadReads = 0;
    listingProbe.archiveRemoved = 0;
    listingProbe.archivePermissionBaseline = listingProbe.permissionRequests;
    const remove = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = function (...args) {
      if (!listingProbe.preparing) listingProbe.archiveRemoved++;
      return remove.apply(this, args);
    };
    FileSystemFileHandle.prototype.getFile = async function (...args) {
      if (this.name.endsWith('.bin') && !listingProbe.preparing) {
        listingProbe.archivePayloadReads++;
        if (listingProbe.archiveHold) {
          listingProbe.archiveHeld = true;
          await new Promise(resolve => { listingProbe.releaseArchive = resolve; });
        }
      }
      return get.apply(this, args);
    };
    listingProbe.archiveWriteBaseline = listingProbe.productWrites;
  });
  const listStarted = Date.now();
  await click('복구 보관함 보기');
  await wait(() => document.querySelector('[data-archive-phase]')?.dataset.archivePhase === 'ready');
  const listElapsedMs = Date.now() - listStarted;
  check('list is real metadata with no payload reads', await page.eval(() => document.querySelectorAll('[aria-label="보관된 복구 사본"] > li').length === 1 && document.querySelector('[aria-label="보관된 복구 사본"]').textContent.includes('검사 전') && listingProbe.archivePayloadReads === 0));
  await click('읽기 안내.md 복구 기록');
  check('expanded details show original location, stored time, bytes and recorded status', await page.eval(() => {
    const text = document.querySelector('[aria-label="보관된 복구 사본"]').textContent;
    return text.includes('하위 자료 / 읽기 안내.md') && text.includes('보관 시각') && text.includes('bytes') && text.includes('백업 완료 기록');
  }));
  const detailStarted = Date.now();
  await click('복구 사본 확인');
  await wait(() => document.querySelector('[data-archive-phase]').textContent.includes('복구 사본이 정상입니다'));
  const detailElapsedMs = Date.now() - detailStarted;
  check('explicit inspection verifies real bytes and paired journals', await page.eval(() => listingProbe.archivePayloadReads > 0 && document.querySelector('[data-archive-phase]').textContent.includes('양쪽 기록 일치')));
  await page.eval(async () => {
    for await (const entry of listingProbe.a.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) listingProbe.restoreVault = entry;
    listingProbe.restoreWriteBaseline = listingProbe.productWrites;
    listingProbe.restorePermissionBaseline = listingProbe.permissionRequests;
  });
  check('vault is a direct child of the source root', await page.eval(async () => (await listingProbe.a.resolve(listingProbe.restoreVault)).length === 1));
  await click('복원 위치 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready' && document.querySelector('[aria-label="목적지 탐색 위치"]').textContent.trim() === '검증 자료 A');
  check('restore defaults to root and reuses creation while excluding the vault', await page.eval(() => !document.querySelector('[aria-label="목적지 하위 폴더"]').textContent.includes(listingProbe.restoreVault.name) && !!document.querySelector('[aria-label="현재 위치에 새 항목 만들기"]') && document.querySelector('[aria-label="목적지 경로 직접 입력"] input').value === '검증 자료 A'));
  await click('검증 자료 A 폴더를 목적지로 선택');
  await wait(() => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'ready');
  check('read-only preview suggests a distinct file and focuses cancel', await page.eval(() => document.querySelector('[data-restore-phase]').textContent.includes('읽기 안내 (복원 1).md') && document.activeElement.textContent === '복원 취소' && listingProbe.productWrites === listingProbe.restoreWriteBaseline && listingProbe.permissionRequests === listingProbe.restorePermissionBaseline));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`restore review contained ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth));
    await page.screenshot({ path: `${out}/restore-review-${width}.png`, format: 'png' });
  }
  await wait(() => new URLSearchParams(location.search).get('flow') === 'restore' && new URLSearchParams(location.search).get('step') === 'review');
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 200)));
  await page.goto(await page.eval(() => location.href), { settleMs: 350 });
  await wait(() => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'ready');
  check('restore review resumes on F5 without writes or permission prompts', await page.eval(() => listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0 && !!document.querySelector('dialog:modal')));
  await click('이 위치에 복원');
  await wait(() => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'completed');
  await wait(() => new URLSearchParams(location.search).get('step') === 'result');
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 200)));
  const completedUrl = await page.eval(() => location.href);
  await page.goto(completedUrl, { settleMs: 350 });
  await wait(() => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'completed');
  check('restored completion is displayed without another restore', await page.eval(() => listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0 && document.querySelector('[data-restore-phase]').textContent.includes('복원 검증됨')));
  const interrupted = new URL(completedUrl);
  interrupted.searchParams.set('step', 'execute');
  await page.goto(interrupted.href, { settleMs: 350 });
  await wait(() => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'error');
  check('execution-stage URL cannot replay a restore', await page.eval(() => listingProbe.productWrites === 0 && document.querySelector('[data-restore-phase]').textContent.includes('자동으로 반복하지')));
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  if (page) {
    writeFileSync(`${out}/last-state.txt`, await page.eval(() => document.body.innerText).catch(String));
    await page.screenshot({ path: `${out}/last-state.png`, format: 'png' }).catch(() => {});
  }
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2));
  await browser.close();
}
console.log(`${checks.length} restore resume UI checks passed`);
