import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3014';
const out = process.argv[3] || 'docs/verification/file-management-six/browser';
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
  await page.eval(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  if (label === '전체 선택 해제' && !await page.eval(() => [...document.querySelectorAll('button')].some(el => el.checkVisibility() && el.textContent.trim() === '전체 선택 해제'))) return;
  if (await revealSelectionControl(page, label)) return;
  const point = await page.eval(label => {
    const root = [...document.querySelectorAll('dialog:modal')].at(-1) ?? document;
    const button = [...root.querySelectorAll('button,summary,input[type=checkbox]')].find(el => el.checkVisibility() && !el.disabled && (el.textContent.trim() === label || el.getAttribute('aria-label') === label));
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
  await page.eval(() => { listingProbe.name = '검증 자료 B'; });
  await click('새 보관함 만들기');
  await click('만들 위치 선택');
  await wait(() => document.body.textContent.includes('생성 위치: 검증 자료 B'));
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
      const a = listingProbe.a;
      await a.getDirectoryHandle('작업 목적지', { create: true });
      await a.getDirectoryHandle('이동 목적지', { create: true });
      const tree = await a.getDirectoryHandle('샘플 트리', { create: true });
      const nested = await tree.getDirectoryHandle('하위', { create: true });
      await nested.getDirectoryHandle('빈 폴더', { create: true });
      const file = await nested.getFileHandle('자료.txt', { create: true });
      const stream = await file.createWritable();
      await stream.write('r'.repeat(16 * 1024 * 1024));
      await stream.close();
      listingProbe.treeExpected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await file.getFile()).arrayBuffer()))].join(',');
      listingProbe.treeChunks = [];
      const writable = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = async function (...args) {
        const stream = await writable.apply(this, args);
        if (!listingProbe.preparing && this.name === '자료.txt') {
          const write = stream.write.bind(stream);
          stream.write = async data => { listingProbe.treeChunks.push(data.size ?? data.byteLength); return write(data); };
        }
        return stream;
      };
      listingProbe.removed = [];
      const remove = FileSystemDirectoryHandle.prototype.removeEntry;
      FileSystemDirectoryHandle.prototype.removeEntry = async function (name, options) {
        if (!listingProbe.preparing) listingProbe.removed.push({ parent: this.name, name, recursive: !!options?.recursive });
        return remove.call(this, name, options);
      };
      listingProbe.productWrites = 0;
    } finally { listingProbe.preparing = false; }
  });
  await click('새로고침');
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  async function choose(path) {
    if (!await page.eval(() => !!document.querySelector('[data-destination-phase]'))) await click('목적지 선택');
    await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
    await page.eval(path => {
      const input = document.querySelector('[aria-label="목적지 경로 직접 입력"] input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, path);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, path);
    await click('경로 열기');
    await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
    await click(await page.eval(() => document.querySelector('[data-destination-phase] button[aria-label$="폴더를 목적지로 선택"]').getAttribute('aria-label')));
    if (await page.eval(() => !![...document.querySelectorAll('button')].find(button => button.checkVisibility() && button.textContent === '계획 만들기'))) await click('계획 만들기');
    await wait(() => ['ready', 'error'].includes(document.querySelector('[data-managed-phase]')?.dataset.managedPhase));
    assert.equal(await page.eval(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase), 'ready', await page.eval(() => document.body.innerText));
  }
  async function run(label) {
    await click(label);
    await wait(() => ['completed', 'error', 'cancelled'].includes(document.querySelector('[data-managed-phase]')?.dataset.managedPhase));
    assert.equal(await page.eval(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase), 'completed', await page.eval(() => document.body.innerText));
    await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  }
  async function closeManaged() {
    await click('파일 작업 닫기');
    await wait(() => !document.querySelector('[data-managed-dialog-phase]'));
  }
  await click('할 일.txt 선택');
  await click('이동');
  await choose('작업 목적지');
  check('move preview focuses cancel and has no source removal', await page.eval(() => document.activeElement.textContent === '검토 취소' && listingProbe.removed.length === 0));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`move review contained ${width}`, await page.eval(() => {
      const dialog = [...document.querySelectorAll('dialog:modal')].at(-1);
      return document.documentElement.scrollWidth <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
    }));
    await page.screenshot({ path: `${out}/move-review-${width}.png`, format: 'png' });
  }
  await run('보존 후 이동 실행');
  check('actual single-file move verifies destination and removes the source non-recursively', await page.eval(async () => {
    try { await listingProbe.a.getFileHandle('할 일.txt'); return false; } catch (e) { if (e.name !== 'NotFoundError') throw e; }
    const file = await (await (await listingProbe.a.getDirectoryHandle('작업 목적지')).getFileHandle('할 일.txt')).getFile();
    return (await file.text()).includes('합성 원문') && listingProbe.removed.length === 1 && !listingProbe.removed[0].recursive;
  }));
  await closeManaged();
  await click('전체 선택 해제');
  await click('샘플 트리 폴더 선택');
  await click('복사');
  await choose('작업 목적지');
  await run('복사 실행');
  check('recursive copy preserves source and empty descendants', await page.eval(async () => {
    const source = await listingProbe.a.getDirectoryHandle('샘플 트리');
    const target = await (await listingProbe.a.getDirectoryHandle('작업 목적지')).getDirectoryHandle('샘플 트리');
    const nested = await target.getDirectoryHandle('하위');
    await nested.getDirectoryHandle('빈 폴더');
    const file = await (await nested.getFileHandle('자료.txt')).getFile();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].join(',');
    return file.size === 16777216 && digest === listingProbe.treeExpected && !!source;
  }));
  await closeManaged();
  await click('이동');
  await choose('이동 목적지');
  await run('보존 후 이동 실행');
  check('recursive move finishes and never uses recursive removal', await page.eval(async () => {
    try { await listingProbe.a.getDirectoryHandle('샘플 트리'); return false; } catch (e) { if (e.name !== 'NotFoundError') throw e; }
    await (await (await listingProbe.a.getDirectoryHandle('이동 목적지')).getDirectoryHandle('샘플 트리')).getDirectoryHandle('하위');
    return listingProbe.removed.every(entry => !entry.recursive) && listingProbe.treeChunks.length === 512 && listingProbe.treeChunks.every(size => size <= 65536);
  }));
  await closeManaged();
  await click('전체 선택 해제');
  await click('회의 메모.md 선택');
  await click('휴지통으로 보내기');
  await click('변경 전 검사');
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'ready');
  await run('보존 후 휴지통으로 보내기');
  await closeManaged();
  await click('휴지통·보존 기록');
  await wait(() => document.querySelector('[data-managed-dialog-phase]')?.dataset.managedDialogPhase === 'ready');
  await click('회의 메모.md휴지통');
  await click('복구 위치 선택');
  await choose('');
  await run('새 항목으로 복구');
  check('trash restores the exact prior bytes and keeps recovery payloads', await page.eval(async () => {
    const file = await (await listingProbe.a.getFileHandle('회의 메모.md')).getFile();
    let trash = 0;
    for await (const entry of listingProbe.b.values()) if (entry.name.startsWith('모아 복구 보관함-')) {
      for await (const operation of entry.values()) if (operation.name.startsWith('moa-managed-')) {
        const manifest = JSON.parse(await (await (await operation.getFileHandle('prepared.json')).getFile()).text());
        if (manifest.kind === 'trash') {
          const payload = await (await operation.getFileHandle(manifest.nodes[0].payload + '.bin')).getFile();
          if (await payload.text() === await file.text()) trash++;
        }
      }
    }
    return (await file.text()).includes('합성 원문') && trash === 1;
  }));
  await closeManaged();
  await click('전체 선택 해제');
  await click('회의 메모.md 미리보기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
// Inline editing is covered by check-workflow-ux.mjs, including F5 and repeated saves.
  await click('목록으로 돌아가기');
  await page.setViewport({ width: 1440, height: 900 });
  await click('공백 있는 이름.txt 선택');
  await click('이동');
  await choose('작업 목적지');
  await page.eval(() => {
    const writable = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const stream = await writable.apply(this, args);
      if (this.name === '공백 있는 이름.txt') {
        const write = stream.write.bind(stream);
        stream.write = async data => {
          listingProbe.managedHeld = true;
          await new Promise(resolve => { listingProbe.releaseManaged = resolve; });
          return write(data);
        };
      }
      return stream;
    };
    listingProbe.cancelRemoveBaseline = listingProbe.removed.length;
  });
  await click('보존 후 이동 실행');
  await wait(() => listingProbe.managedHeld);
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('Escape retains a running managed dialog while cancellation settles', await page.eval(() => document.querySelector('[data-managed-dialog-phase]')?.dataset.managedDialogPhase === 'running' && document.body.textContent.includes('중단 결과를 정리')));
  await page.eval(() => listingProbe.releaseManaged());
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'cancelled');
  check('cancelled move keeps the source and an uncertain partial target', await page.eval(async () => {
    const source = await (await listingProbe.a.getFileHandle('공백 있는 이름.txt')).getFile();
    const target = await (await (await listingProbe.a.getDirectoryHandle('작업 목적지')).getFileHandle('공백 있는 이름.txt')).getFile();
    return source.size > 0 && target.size === 0 && listingProbe.removed.length === listingProbe.cancelRemoveBaseline && document.querySelector('[data-managed-phase]').textContent.includes('결과 확인 필요');
  }));
  await closeManaged();
  await click('이동');
  await choose('이동 목적지');
  await page.eval(async () => {
    listingProbe.preparing = true;
    try { await (await listingProbe.a.getDirectoryHandle('이동 목적지')).getFileHandle('공백 있는 이름.txt', { create: true }); }
    finally { listingProbe.preparing = false; }
    listingProbe.collisionWriteBaseline = listingProbe.productWrites;
  });
  await click('보존 후 이동 실행');
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'error');
  check('late empty destination collision blocks all writes and source removal', await page.eval(async () => {
    const file = await (await (await listingProbe.a.getDirectoryHandle('이동 목적지')).getFileHandle('공백 있는 이름.txt')).getFile();
    return file.size === 0 && listingProbe.productWrites === listingProbe.collisionWriteBaseline && listingProbe.removed.length === listingProbe.cancelRemoveBaseline;
  }));
  await closeManaged();
  check('all permission requests originate in active user gestures', await page.eval(() => listingProbe.requestsActive.every(Boolean)));
  check('unselected sentinel remains unchanged', await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  if (page) {
    writeFileSync(`${out}/last-state.txt`, await page.eval(() => document.body.innerText).catch(String));
    await page.screenshot({ path: `${out}/last-state.png`, format: 'png' }).catch(() => {});
  }
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2));
  await browser.close();
}
console.log(`${checks.length} managed file UI checks passed`);
