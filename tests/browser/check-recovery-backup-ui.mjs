import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3014';
const out = process.argv[3] || 'docs/verification/recovery-backup/ui';
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
  await click('폴더 연결');
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await page.eval(() => { listingProbe.name = '검증 자료 B'; });
  await click('새 보관함 만들기');
  await click('만들 위치 선택');
  await wait(() => document.body.textContent.includes('생성 위치: 검증 자료 B'));
  await click('이 위치에 보관함 생성');
  await wait(() => document.body.textContent.includes('위치·식별 확인됨'));
  await click('폴더 연결 관리 닫기');
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const parent = await listingProbe.a.getDirectoryHandle('하위 자료');
      const target = await parent.getFileHandle('읽기 안내.md', { create: true });
      const stream = await target.createWritable();
      await stream.write('이전 목적지의 보관할 내용');
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
    for await (const entry of listingProbe.b.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) vault = entry;
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
  await click('계획으로 돌아가기');
  await click('충돌 파일 검사');
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'ready');
  await page.eval(() => {
    const create = FileSystemFileHandle.prototype.createWritable;
    listingProbe.holdBackup = true;
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const stream = await create.apply(this, args);
      if (!this.name.endsWith('.bin')) return stream;
      const write = stream.write.bind(stream);
      stream.write = async data => {
        if (listingProbe.failBackup) throw new DOMException('synthetic full', 'QuotaExceededError');
        await write(data);
        if (listingProbe.holdBackup) {
          listingProbe.backupHeld = true;
          await new Promise(resolve => { listingProbe.releaseBackup = resolve; });
        }
      };
      return stream;
    };
  });
  await click('기존 파일의 복구 사본 만들기');
  await wait(() => listingProbe.backupHeld);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape requests cancellation and retains the result dialog', await page.eval(() => !!document.querySelector('dialog:modal') && document.body.textContent.includes('중단 요청을 처리')));
  await page.eval(() => { listingProbe.holdBackup = false; listingProbe.releaseBackup(); });
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'cancelled');
  check('cancelled item is uncertain and cannot be retried without reinspection', await page.eval(() => document.body.textContent.includes('확인 필요') && ![...document.querySelectorAll('button')].some(el => el.textContent === '기존 파일의 복구 사본 만들기')));
  check('cancellation preserves old target', await page.eval(async () => JSON.stringify(await listingProbe.targetSnapshot()) === JSON.stringify(listingProbe.targetBefore)));
  await click('계획으로 돌아가기');
  await click('충돌 파일 검사');
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'ready');
  await page.eval(() => { listingProbe.failBackup = true; });
  await click('기존 파일의 복구 사본 만들기');
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'error');
  check('write failure is displayed without success', await page.eval(() => document.body.textContent.includes('백업을 완료하지 못했습니다') && !document.body.textContent.includes('복구 사본을 만들고 검증했습니다')));
  check('failed backup preserves source and target', await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before) && JSON.stringify(await listingProbe.targetSnapshot()) === JSON.stringify(listingProbe.targetBefore)));
  await click('계획 닫기');
  check('closing restores focus', await page.eval(() => !document.querySelector('dialog:modal') && document.activeElement !== document.body));
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2));
  await browser.close();
}
console.log(`${checks.length} backup UI checks passed`);
