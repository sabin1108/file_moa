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
  async function edit(text) {
    await page.eval(text => {
      const input = document.querySelector('[aria-label="문서 인라인 편집기"] textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
  }
  async function bindFixture() {
    await page.eval(async () => {
      const root = await navigator.storage.getDirectory();
      listingProbe.a = await root.getDirectoryHandle('검증 자료 A');
      listingProbe.b = await root.getDirectoryHandle('검증 자료 B');
    });
  }
  async function text() {
    return page.eval(async () => (await (await listingProbe.a.getFileHandle('회의 메모.md')).getFile()).text());
  }
  async function archives() {
    return page.eval(async () => {
      const found = [];
      for await (const vault of listingProbe.b.values()) if (vault.name.startsWith('모아 복구 보관함-')) {
        for await (const operation of vault.values()) if (operation.name.startsWith('moa-managed-')) {
          const manifest = JSON.parse(await (await (await operation.getFileHandle('prepared.json')).getFile()).text());
          if (manifest.kind === 'edit') found.push(await (await (await operation.getFileHandle(manifest.nodes[0].payload + '.bin')).getFile()).text());
        }
      }
      return found;
    });
  }
  const original = await text();
  await click('회의 메모.md 미리보기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const measure = () => {
      const section = document.querySelector('[data-preview-phase], [data-editor-phase]');
      const body = section.querySelector('article, textarea'), style = getComputedStyle(body), rect = body.getBoundingClientRect();
      return { width: rect.width, y: rect.y - section.getBoundingClientRect().y, font: style.fontSize, line: style.lineHeight, padding: style.padding };
    };
    const reading = await page.eval(measure);
    await page.screenshot({ path: `${out}/reading-${width}.png`, format: 'png' });
    await click('문서 편집');
    await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready');
    const editing = await page.eval(measure);
    check(`reading and editing geometry matches ${width}`, JSON.stringify(reading) === JSON.stringify(editing), { reading, editing });
    await page.screenshot({ path: `${out}/editing-${width}.png`, format: 'png' });
    await click('미리보기로 돌아가기');
    await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  }
  await page.setViewport({ width: 1440, height: 900 });
  const previewMetrics = await page.eval(() => {
    const body = document.querySelector('[aria-label="문서 본문"]');
    const style = getComputedStyle(body), rect = body.getBoundingClientRect();
    return { x: rect.x, y: rect.y - document.querySelector('[data-preview-phase]').getBoundingClientRect().y, width: rect.width, font: style.fontFamily, size: style.fontSize, line: style.lineHeight, padding: style.padding };
  });
  await page.screenshot({ path: `${out}/document-preview.png`, format: 'png' });
  await click('문서 편집');
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready');
  const editorMetrics = await page.eval(() => {
    const body = document.querySelector('[data-editor-phase] textarea');
    const style = getComputedStyle(body), rect = body.getBoundingClientRect();
    return { x: rect.x, y: rect.y - document.querySelector('[data-editor-phase]').getBoundingClientRect().y, width: rect.width, font: style.fontFamily, size: style.fontSize, line: style.lineHeight, padding: style.padding };
  });
  check('preview and edit use the same document geometry and typography', JSON.stringify(previewMetrics) === JSON.stringify(editorMetrics), { previewMetrics, editorMetrics });
  check('desktop editing replaces preview without another modal', await page.eval(() => document.querySelectorAll('dialog:modal').length === 0));
  await edit('첫 저장 내용\n한글');
  await wait(() => new URLSearchParams(location.search).get('flow') === 'edit');
  check('URL contains an opaque ID and no document text or filename', await page.eval(() => {
    const p = new URLSearchParams(location.search);
    return /^[a-f0-9-]{36}$/.test(p.get('draft')) && p.get('step') === 'review' && !decodeURI(location.search).includes('회의');
  }));
  await click('원본 보존하고 저장');
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready' && document.querySelector('[data-editor-phase]').textContent.includes('저장됨'));
  check('first explicit save writes bytes and preserves the original once', await text() === '첫 저장 내용\n한글' && JSON.stringify(await archives()) === JSON.stringify([original]));
  await edit('두 번째 저장');
  await click('저장');
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready' && document.querySelector('[data-editor-phase]').textContent.includes('저장됨'));
  check('second save reuses the original preservation', await text() === '두 번째 저장' && (await archives()).length === 1);
  await page.eval(() => {
    localStorage.setItem('moa-editor-autosave-seconds-v1', '15');
    window.dispatchEvent(new StorageEvent('storage', { key: 'moa-editor-autosave-seconds-v1', storageArea: localStorage }));
  });
  await edit('주기적 저장 내용');
  const permissionBefore = await page.eval(() => listingProbe.permissionRequests);
  await wait(() => document.querySelector('[data-editor-phase]').textContent.includes('저장됨'));
  check('periodic save writes without permission prompts or another backup', await text() === '주기적 저장 내용' && (await archives()).length === 1 && await page.eval(() => listingProbe.permissionRequests) === permissionBefore);
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`inline editor contained ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('[data-editor-phase]').scrollWidth <= document.querySelector('[data-editor-phase]').clientWidth));
    await page.screenshot({ path: `${out}/inline-editor-${width}.png`, format: 'png' });
  }
  await page.setViewport({ width: 1440, height: 900 });
  await page.eval(() => { localStorage.setItem('moa-editor-autosave-seconds-v1', '0'); window.dispatchEvent(new StorageEvent('storage', { key: 'moa-editor-autosave-seconds-v1', storageArea: localStorage })); });
  await edit('F5 이전 미저장 초안');
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 250)));
  const url = await page.eval(() => location.href);
  await page.goto(url, { settleMs: 350 });
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready');
  await bindFixture();
  check('F5 resumes granted connections and dirty inline draft without requests or writes', await page.eval(() => document.querySelector('textarea').value === 'F5 이전 미저장 초안' && listingProbe.permissionRequests === 0 && listingProbe.productWrites === 0) && await text() === '주기적 저장 내용');
  await click('저장');
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready' && document.querySelector('[data-editor-phase]').textContent.includes('저장됨'));
  check('F5 checkpoint permits explicit save without a second backup', await text() === 'F5 이전 미저장 초안' && (await archives()).length === 1);
  await edit('외부 변경과 충돌할 로컬 초안');
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const stream = await (await listingProbe.a.getFileHandle('회의 메모.md')).createWritable();
      await stream.write('외부 편집기 버전');
      await stream.close();
    } finally { listingProbe.preparing = false; }
    listingProbe.externalWriteBaseline = listingProbe.productWrites;
  });
  await click('저장');
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'error');
  check('external modification pauses saving and retains the local draft', await page.eval(() => document.querySelector('textarea').value === '외부 변경과 충돌할 로컬 초안') && await text() === '외부 편집기 버전');
  await click('편집 내용 버리고 원문 다시 읽기');
  await wait(() => document.querySelector('[data-editor-phase]')?.dataset.editorPhase === 'ready');
  check('explicit baseline reload reads the external version', await page.eval(() => document.querySelector('textarea').value === '외부 편집기 버전'));
  await edit('버릴 초안');
  await click('미리보기로 돌아가기');
  await click('계속 편집');
  await click('미리보기로 돌아가기');
  await click('편집 내용 버리고 닫기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  await click('목록으로 돌아가기');
  await click('하위 자료 폴더 선택');
  await click('복사');
  check('folder copy starts at the same explicit destination plan as file copy', await page.eval(() => !document.querySelector('[data-destination-phase]') && !!document.querySelector('[aria-label="목적지 지정"]') && [...document.querySelectorAll('button')].some(button => button.textContent === '계획 만들기' && button.disabled)));
  await page.screenshot({ path: `${out}/folder-plan.png`, format: 'png' });
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`shared folder plan contained ${width}`, await page.eval(() => document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth));
    await page.screenshot({ path: `${out}/folder-plan-${width}.png`, format: 'png' });
  }
  await page.setViewport({ width: 1440, height: 900 });
  await click('목적지 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  check('folder operations reuse the full destination form with a nonempty root', await page.eval(() => document.querySelector('[aria-label="목적지 경로 직접 입력"] input').value === '검증 자료 A' && !!document.querySelector('[data-destination-phase] summary')));
  await click('＋ 새로 만들기');
  await page.eval(() => {
    const input = document.querySelector('[data-destination-phase] form[aria-label="새로 만들기"] input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '새 목적지');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('만들기');
  await wait(() => [...document.querySelectorAll('[aria-label="목적지 하위 폴더"] button')].some(button => button.textContent.includes('새 목적지')));
  await page.eval(() => [...document.querySelectorAll('[aria-label="목적지 하위 폴더"] button')].find(button => button.textContent.includes('새 목적지')).click());
  await wait(() => document.querySelector('[aria-label="새 목적지 폴더를 목적지로 선택"]')?.disabled === false);
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 200)));
  await page.goto(await page.eval(() => location.href), { settleMs: 350 });
  await wait(() => document.querySelector('[aria-label="새 목적지 폴더를 목적지로 선택"]')?.disabled === false);
  await bindFixture();
  check('F5 restores an unconfirmed browsing path without treating it as a selected plan', await page.eval(() => listingProbe.productWrites === 0 && document.querySelector('[data-destination-phase] input').value.endsWith('새 목적지')));
  await click('새 목적지 폴더를 목적지로 선택');
  check('folder destination confirmation returns to the plan and restores focus without automatic inspection', await page.eval(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'draft' && !document.querySelector('[data-destination-phase]') && document.activeElement?.getAttribute('aria-label') === '목적지 선택'));
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 200)));
  await page.goto(await page.eval(() => location.href), { settleMs: 350 });
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'draft');
  await bindFixture();
  check('F5 retains the confirmed destination before plan inspection', await page.eval(() => !document.querySelector('[data-destination-phase]') && document.querySelector('[aria-label="목적지 선택"]').textContent.includes('새 목적지') && [...document.querySelectorAll('button')].some(button => button.textContent === '계획 만들기' && !button.disabled) && listingProbe.productWrites === 0));
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'ready');
  await wait(() => new URLSearchParams(location.search).get('step') === 'review');
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 250)));
  await page.goto(await page.eval(() => location.href), { settleMs: 350 });
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'ready');
  await bindFixture();
  check('folder review and destination survive F5 without replaying a write', await page.eval(() => document.querySelector('[data-managed-phase]').textContent.includes('새 목적지') && listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0 && document.querySelector('[aria-current="step"]')?.textContent.includes('검사')));
  check('transient notification is a compact fixed toast at the lower right', await page.eval(() => {
    const toast = document.querySelector('[data-transient-notice]'), rect = toast.getBoundingClientRect();
    return getComputedStyle(toast).position === 'fixed' && rect.width <= 420 && innerWidth - rect.right >= 16 && innerHeight - rect.bottom >= 16;
  }));
  await wait(() => !document.querySelector('[data-transient-notice]'));
  check('temporary restore notice auto-dismisses while the actual review remains', await page.eval(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'ready'));
  await click('복사 실행');
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'completed');
  check('resumed folder copy requires explicit execution and creates the selected target', await page.eval(async () => !!await (await listingProbe.a.getDirectoryHandle('새 목적지')).getDirectoryHandle('하위 자료')));
  await wait(() => new URLSearchParams(location.search).get('step') === 'result');
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 200)));
  await page.goto(await page.eval(() => location.href), { settleMs: 350 });
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'completed');
  check('completed result survives F5 as a local record without repeating the copy', await page.eval(() => listingProbe.productWrites === 0 && document.querySelector('[aria-current="step"]')?.textContent.includes('결과')));
  await bindFixture();
  await click('파일 작업 닫기');
  await click('알림 닫기');
  check('temporary notice also has a working explicit close button', await page.eval(() => !document.querySelector('[data-transient-notice]')));
  await page.eval(async () => {
    listingProbe.preparing = true;
    try {
      const child = await listingProbe.a.getDirectoryHandle('하위 자료');
      const stream = await (await child.getFileHandle('읽기 안내.md', { create: true })).createWritable();
      await stream.write('기존 목적지 내용');
      await stream.close();
    } finally { listingProbe.preparing = false; }
  });
  await click('읽기 안내.md 선택');
  await click('복사');
  await choosePlanDestination(page, click, '하위 자료');
  await page.eval(() => {
    const select = document.querySelector('[aria-label="목적지 지정"] select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'move');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(() => document.querySelector('[data-managed-phase]')?.dataset.managedPhase === 'draft');
  check('switching file copy to move retains the confirmed destination in the shared plan', await page.eval(() => document.querySelector('[aria-label="목적지 선택"]').textContent.includes('하위 자료') && !document.querySelector('[data-destination-phase]') && [...document.querySelectorAll('button')].some(button => button.textContent === '계획 만들기' && !button.disabled)));
  await click('파일 작업 닫기');
  await click('복사');
  await choosePlanDestination(page, click, '하위 자료');
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
  await click('충돌 파일 검사');
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'ready');
  await wait(() => new URLSearchParams(location.search).get('step') === 'inspect');
  check('shared stepper keeps preservation and overwrite stages visible', await page.eval(() => document.querySelector('[aria-current="step"]')?.textContent.includes('검사') && document.querySelector('[aria-label="복사·이동 진행 단계"]')?.textContent.includes('덮어쓰기')));
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 200)));
  await page.goto(await page.eval(() => location.href), { settleMs: 350 });
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'ready');
  await bindFixture();
  check('copy conflict review resumes read-only after F5', await page.eval(() => listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0));
  await click('기존 파일의 복구 사본 만들기');
  await wait(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'completed');
  await wait(() => new URLSearchParams(location.search).get('step') === 'overwrite');
  check('stepper advances to overwrite after explicit preservation', await page.eval(() => document.querySelector('[aria-current="step"]')?.textContent.includes('덮어쓰기')));
  await page.screenshot({ path: `${out}/shared-picker.png`, format: 'png' });
  await page.goto(base + '/settings', { settleMs: 350 });
  await wait(() => !!document.querySelector('[aria-label="문서 편집 설정"] select'));
  await page.eval(() => {
    const select = document.querySelector('[aria-label="문서 편집 설정"] select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '60');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.goto(base + '/settings', { settleMs: 350 });
  await wait(() => document.querySelector('[aria-label="문서 편집 설정"] select')?.value === '60');
  check('user-facing settings retain the selected interval across reload', await page.eval(() => localStorage.getItem('moa-editor-autosave-seconds-v1') === '60'));
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900 });
    check(`editor settings contained ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${out}/editor-settings-${width}.png`, format: 'png' });
  }
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  if (page) {
    writeFileSync(`${out}/last-state.txt`, await page.eval(() => document.body.innerText).catch(String));
    await page.screenshot({ path: `${out}/last-state.png`, format: 'png' }).catch(() => {});
  }
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2));
  await browser.close();
}
console.log(`${checks.length} workflow UX checks passed`);
