import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3014';
const out = process.argv[3] || 'docs/verification/workflow-ux/browser';
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
  check('vault reading actions and connection management have separate named groups', await page.eval(() => {
    const management = [...document.querySelectorAll('fieldset')].find(field => field.querySelector('legend')?.textContent === '보관함 연결 관리');
    return !!management && ['새 보관함 만들기', '다른 보관함 선택', '보관함 연결 해제'].every(label => [...management.querySelectorAll('button')].some(button => button.textContent.trim() === label))
      && !management.textContent.includes('보관함 상태 확인') && !!document.querySelector('[aria-label="현재 보관함 확인"]');
  }));
  await page.screenshot({ path: `${out}/vault-groups.png`, format: 'png' });
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900 });
    check(`vault action groups contained ${width}`, await page.eval(() => document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth));
    await page.screenshot({ path: `${out}/vault-groups-${width}.png`, format: 'png' });
  }
  await click('복구 보관함 보기');
  await wait(() => document.querySelector('[data-archive-phase]')?.dataset.archivePhase === 'ready');
  check('empty connected vault is shown honestly inside settings', await page.eval(() => document.querySelector('[data-archive-phase]').textContent.includes('아직 보관된 복구 사본이 없습니다')));
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  check('nested archive Escape retains settings and restores its trigger', await page.eval(() => document.querySelectorAll('dialog:modal').length === 1 && document.activeElement.textContent === '복구 보관함 보기'));
  await click('폴더 연결 관리 닫기');
  await click('폴더 연결 관리');
  await page.eval(() => {
    const get = FileSystemFileHandle.prototype.getFile;
    listingProbe.blockVault = true;
    FileSystemFileHandle.prototype.getFile = function (...args) {
      if (listingProbe.blockVault && this.name === '.moa-vault.json') throw new DOMException('synthetic revoked permission', 'NotAllowedError');
      return get.apply(this, args);
    };
  });
  await click('보관함 상태 확인');
  await wait(() => document.querySelector('[aria-label="복구 보관함 설정"]').textContent.includes('다시 연결 필요'));
  check('permission recovery exposes one existing-vault connection action', await page.eval(() => {
    const field = document.querySelector('[aria-label="복구 보관함 설정"] fieldset');
    return [...field.querySelectorAll('button')].filter(button => button.textContent.trim() === '기존 보관함 연결').length === 1 && !field.textContent.includes('보관함 다시 연결');
  }));
  await page.eval(async () => {
    listingProbe.blockVault = false;
    for await (const entry of listingProbe.b.values()) if (entry.name.startsWith('모아 복구 보관함-')) listingProbe.connectedVault = entry;
    listingProbe.vaultSelections = 0;
    window.showDirectoryPicker = async () => { listingProbe.vaultSelections++; return listingProbe.connectedVault; };
    listingProbe.connectionWrites = listingProbe.productWrites;
  });
  await click('기존 보관함 연결');
  await wait(() => document.querySelector('[aria-label="복구 보관함 설정"]').textContent.includes('위치·식별 확인됨'));
  check('the single connection action reselects the existing vault without creating files', await page.eval(() => listingProbe.vaultSelections === 1 && listingProbe.productWrites === listingProbe.connectionWrites && document.querySelector('[aria-label="복구 보관함 설정"]').textContent.includes('다른 보관함 선택')));
  await click('폴더 연결 관리 닫기');
  await click('회의 메모.md 미리보기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  for (const width of [390, 768, 1440, 1920, 2560, 3840]) {
    await page.setViewport({ width, height: width >= 2560 ? 1440 : 900 });
    await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const measure = () => {
      const body = document.querySelector('[aria-label="문서 본문"], [data-editor-phase] textarea'), rect = body.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };
    const reading = await page.eval(measure);
    await page.screenshot({ path: `${out}/a4-reading-${width}.png`, format: 'png' });
    await click('문서 편집');
    await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready');
    const editing = await page.eval(measure);
    check(`A4 ratio and matching reading/editing page ${width}`, Math.abs(reading.width - editing.width) < 1 && Math.abs(reading.height - editing.height) < 1
      && Math.abs(reading.height / reading.width - 297 / 210) < 0.005 && reading.width <= 795 && (width < 1920 || reading.width > 790), { reading, editing });
    await page.screenshot({ path: `${out}/a4-editing-${width}.png`, format: 'png' });
    await click('미리보기로 돌아가기');
    await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  }
  await page.setViewport({ width: 1920, height: 1080 });
  await click('문서 편집');
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready');
  await page.eval(() => {
    const input = document.querySelector('[data-editor-phase] textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '닫기 확인용 합성 초안');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('미리보기로 돌아가기');
  check('unsaved warning and actions have a visible gap within the document width', await page.eval(() => {
    const group = document.querySelector('[aria-label="저장하지 않은 편집 확인"]');
    const gap = group.lastElementChild.getBoundingClientRect().top - group.firstElementChild.getBoundingClientRect().bottom;
    return gap >= 11 && gap <= 13 && group.getBoundingClientRect().width <= 795;
  }));
  await page.screenshot({ path: `${out}/unsaved-warning-1920.png`, format: 'png' });
  await click('편집 내용 버리고 닫기');
  const shared = base + '/files?flow=copy&step=destination&draft=' + crypto.randomUUID();
  await page.goto(shared, { settleMs: 350 });
  await wait(() => !!document.querySelector('[data-transient-notice]'));
  check('toast sits at the lower right without pushing the workspace down', await page.eval(() => {
    const toast = document.querySelector('[data-transient-notice]'), rect = toast.getBoundingClientRect();
    return getComputedStyle(toast).position === 'fixed' && rect.width <= 420 && innerHeight - rect.bottom === 24 && innerWidth - rect.right === 24
      && document.querySelector('header').getBoundingClientRect().top === 0;
  }));
  await page.screenshot({ path: `${out}/bottom-right-toast.png`, format: 'png' });
  await click('알림 닫기');
  check('toast closes without changing folder listing', await page.eval(() => !document.querySelector('[data-transient-notice]') && document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready'));
  await page.goto(shared, { settleMs: 350 });
  await wait(() => !!document.querySelector('[data-transient-notice]'));
  await wait(() => !document.querySelector('[data-transient-notice]'));
  check('toast still dismisses automatically after its lifetime', await page.eval(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready'));
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  if (page) {
    writeFileSync(`${out}/last-state.txt`, await page.eval(() => document.body.innerText).catch(String));
    await page.screenshot({ path: `${out}/last-state.png`, format: 'png' }).catch(() => {});
  }
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2));
  await browser.close();
}
console.log(`${checks.length} A4/vault/toast checks passed`);
