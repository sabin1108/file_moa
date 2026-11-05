import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3014';
const out = process.argv[3] || 'docs/verification/recovery-overwrite/ui';
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
  await page.eval(async () => {
    listingProbe.overwriteTarget = await (await listingProbe.a.getDirectoryHandle('하위 자료')).getFileHandle('읽기 안내.md');
    listingProbe.targetOpens = 0;
    const create = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const target = await this.isSameEntry(listingProbe.overwriteTarget);
      if (target && !listingProbe.preparing) listingProbe.targetOpens++;
      const stream = await create.apply(this, args);
      if (!target) return stream;
      const write = stream.write.bind(stream);
      stream.write = async data => {
        if (!listingProbe.preparing && listingProbe.targetWriteSizes) listingProbe.targetWriteSizes.push(data.size);
        await write(data);
        if (listingProbe.holdOverwrite && !listingProbe.preparing) {
          listingProbe.overwriteHeld = true;
          await new Promise(resolve => { listingProbe.releaseOverwrite = resolve; });
        }
      };
      return stream;
    };
  });
  await click('덮어쓰기 검토');
  check('final warning is separate and defaults to stop', await page.eval(() => document.querySelector('[data-overwrite-phase]')?.dataset.overwritePhase === 'confirming' && document.activeElement.textContent === '덮어쓰기 중단' && listingProbe.targetOpens === 0));
  check('warning names location, bytes and undecided retention', await page.eval(() => {
    const text = document.querySelector('[data-overwrite-phase]').textContent;
    return text.includes('하위 자료') && text.includes('bytes') && text.includes('자동 삭제 없음') && text.includes('충돌 없는 선택 파일은 이번에 복사하지 않습니다');
  }));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await page.eval(() => { document.querySelector('dialog:modal').scrollTop = 0; });
    check(`overwrite warning contained ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth));
    await page.screenshot({ path: `${out}/overwrite-warning-${width}.png`, format: 'png' });
  }
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  check('Tab remains in final modal', await page.eval(() => document.querySelector('dialog:modal').contains(document.activeElement)));
  await click('덮어쓰기 중단');
  check('dismissing warning does not replace files', await page.eval(() => !document.querySelector('[data-overwrite-phase]') && listingProbe.targetOpens === 0));
  await click('덮어쓰기 검토');
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const stream = await listingProbe.overwriteTarget.createWritable();
      await stream.write('다른 프로그램이 바꾼 합성 내용');
      await stream.close();
      listingProbe.changedTarget = await listingProbe.targetSnapshot();
    } finally { listingProbe.preparing = false; }
  });
  await click('복구 사본을 남기고 덮어쓰기');
  await wait(() => document.querySelector('[data-overwrite-phase]')?.dataset.overwritePhase === 'error');
  check('changed target rejected before any target writable', await page.eval(async () => listingProbe.targetOpens === 0 && JSON.stringify(await listingProbe.targetSnapshot()) === JSON.stringify(listingProbe.changedTarget)));
  check('failure offers no automatic retry', await page.eval(() => !!document.querySelector('[data-overwrite-phase] [role="alert"]') && ![...document.querySelectorAll('button')].some(b => b.textContent === '복구 사본을 남기고 덮어쓰기')));

  async function newBackup() {
    await click('계획 닫기');
    await click('복사');
    await choosePlanDestination(page, click, '하위 자료');
    await click('계획 만들기');
    await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
    await click('충돌 파일 검사');
    await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'ready');
    await click('기존 파일의 복구 사본 만들기');
    await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'completed');
    await click('덮어쓰기 검토');
  }
  await newBackup();
  const started = Date.now();
  await click('복구 사본을 남기고 덮어쓰기');
  await wait(() => ['completed', 'error'].includes(document.querySelector('[data-overwrite-phase]')?.dataset.overwritePhase));
  const elapsedMs = Date.now() - started;
  check('actual overwrite completes and verifies', await page.eval(() => document.querySelector('[data-overwrite-phase]').dataset.overwritePhase === 'completed' && document.body.textContent.includes('덮어쓰기 검증됨')));
  check('actual target has source bytes', await page.eval(async () => {
    const source = await (await listingProbe.a.getFileHandle('읽기 안내.md')).getFile();
    return await source.text() === (await listingProbe.targetSnapshot()).body && listingProbe.targetOpens === 1;
  }));
  check('source sentinel still unchanged', await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  check('backup preserved and paired overwrite records verified', await page.eval(async () => {
    let vault;
    for await (const entry of listingProbe.b.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) vault = entry;
    const history = await (await listingProbe.a.getDirectoryHandle('하위 자료')).getDirectoryHandle('.moa-history');
    let completed = false;
    for await (const entry of vault.values()) {
      if (entry.kind !== 'directory' || !entry.name.startsWith('moa-overwrite-')) continue;
      const stopped = await (await (await entry.getFileHandle('stopped.json')).getFile()).text();
      const value = JSON.parse(stopped);
      if (value.reason !== 'completed') continue;
      const paired = await history.getDirectoryHandle(entry.name);
      const other = await (await (await paired.getFileHandle('stopped.json')).getFile()).text();
      const backup = await vault.getDirectoryHandle('moa-backup-' + value.backupOperationId);
      const prepared = JSON.parse(await (await (await backup.getFileHandle('prepared.json')).getFile()).text());
      const old = await (await (await backup.getFileHandle(prepared.items[0].recoveryId + '.bin')).getFile()).text();
      completed = stopped === other && value.operation === 'recovery-overwrite' && old === listingProbe.changedTarget.body;
    }
    return completed;
  }));
  await page.screenshot({ path: `${out}/overwrite-completed.png`, format: 'png' });

  await newBackup();
  await page.eval(() => { listingProbe.holdOverwrite = true; });
  await click('복구 사본을 남기고 덮어쓰기');
  await wait(() => listingProbe.overwriteHeld);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape waits for overwrite cancellation settlement', await page.eval(() => !!document.querySelector('dialog:modal') && document.body.textContent.includes('중단을 처리')));
  await page.eval(() => { listingProbe.holdOverwrite = false; listingProbe.releaseOverwrite(); });
  await wait(() => document.querySelector('[data-overwrite-phase]')?.dataset.overwritePhase === 'cancelled');
  check('cancelled target is uncertain and source intact', await page.eval(async () => document.body.textContent.includes('확인 필요') && JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const source = await listingProbe.a.getFileHandle('읽기 안내.md');
      const stream = await source.createWritable();
      await stream.write(new Uint8Array(16 * 1024 * 1024).fill(7));
      await stream.close();
      listingProbe.largeBefore = await listingProbe.sentinel();
      listingProbe.targetWriteSizes = [];
    } finally { listingProbe.preparing = false; }
  });
  await newBackup();
  const largeStart = Date.now();
  await click('복구 사본을 남기고 덮어쓰기');
  await wait(() => ['completed', 'error'].includes(document.querySelector('[data-overwrite-phase]')?.dataset.overwritePhase));
  const largeElapsedMs = Date.now() - largeStart;
  check('16 MiB boundary overwrite completes', await page.eval(() => document.querySelector('[data-overwrite-phase]').dataset.overwritePhase === 'completed'));
  check('16 MiB uses 256 fixed 64 KiB target writes', await page.eval(() => listingProbe.targetWriteSizes.length === 256 && listingProbe.targetWriteSizes.every(size => size === 64 * 1024)));
  check('16 MiB source and destination hashes match with source metadata unchanged', await page.eval(async () => {
    const file = await listingProbe.overwriteTarget.getFile();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))];
    return file.size === 16 * 1024 * 1024 && JSON.stringify(hash) === JSON.stringify(listingProbe.largeBefore.hash)
      && JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.largeBefore);
  }));
  await click('계획 닫기');
  check('close restores focus', await page.eval(() => !document.querySelector('dialog:modal') && document.activeElement !== document.body));
  check('permission requests have active user gestures', await page.eval(() => listingProbe.requestsActive.every(Boolean)));
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
  writeFileSync(`${out}/timing.json`, JSON.stringify({ operation: 'one-target-overwrite-with-backup-revalidation', elapsedMs,
    boundary16MiB: { elapsedMs: largeElapsedMs, chunks: 256, chunkBytes: 65536 } }, null, 2));
} finally {
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2));
  await browser.close();
}
console.log(`${checks.length} overwrite UI checks passed`);
