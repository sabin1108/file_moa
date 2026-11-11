import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/recovery-connection/browser';

mkdirSync(out, { recursive: true });

const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
const checks = [];
const timings = [];
let page;

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  assert.ok(passed, name);
}

async function wait(predicate) {
  for (let i = 0; i < 250; i++) {
    if (await page.eval(predicate)) return;

    await new Promise(resolve => setTimeout(resolve, 30));
  }

  throw Error('Timed out: ' + predicate);
}

async function click(label) {
  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const button = [...root.querySelectorAll('button')].find(el => el.checkVisibility() && !el.disabled && (el.textContent.trim() === label || el.getAttribute('aria-label') === label));

    if (!button) throw Error('Missing enabled button: ' + label);

    button.scrollIntoView({ block: 'center' });

    const rect = button.getBoundingClientRect();

    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, label);

  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}

const done = () => ![...document.querySelectorAll('button')].some(el => el.checkVisibility() && el.textContent === '보관함 작업 중단');
const connected = () => document.querySelector('[aria-label="복구 보관함 설정"]').textContent.includes('위치·식별 확인됨');

try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(base + '/files', { settleMs: 350 });
  await click('폴더 연결 관리');
  check(
    'vault requires source connection',
    await page.eval(() => [...document.querySelectorAll('button')].find(el => el.textContent === '새 보관함 만들기').disabled)
  );
  await wait(() => [...document.querySelectorAll('button')].some(button => button.textContent === '폴더 연결' && !button.disabled));
  await click('폴더 연결');
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  check(
    'source connection continues to vault in the same dialog',
    await page.eval(() => !!document.querySelector('dialog:modal') && document.activeElement?.textContent === '복구 보관함')
  );

  await click('새 보관함 만들기');
  await page.eval(() => {
    listingProbe.originalPicker = window.showDirectoryPicker;
    window.showDirectoryPicker = async () => listingProbe.a.getDirectoryHandle('하위 자료');
  });
  await page.setViewport({ width: 390, height: 900 });
  await click('만들 위치 선택');
  await wait(done);
  check(
    'deep source location refused with clear repair and zero writes',
    await page.eval(() => listingProbe.productWrites === 0 && document.body.textContent.includes('자료 폴더 최상위')
      && !!document.querySelector('[role="alert"]')
      && document.activeElement?.getAttribute('aria-label') === '보관함 설정 오류')
  );
  await page.screenshot({ path: `${out}/location-error-390.png`, format: 'png' });
  check(
    'repair action is visible in the error',
    await page.eval(() => [...document.querySelectorAll('[aria-label="보관함 설정 오류"] button')].some(el => el.textContent === '다른 위치 선택' && el.getBoundingClientRect().bottom <= innerHeight))
  );
  await page.setViewport({ width: 1440, height: 900 });

  await page.eval(() => {
    window.showDirectoryPicker = listingProbe.originalPicker;
    listingProbe.name = '검증 자료 B';
  });

  const started = Date.now();

  await click('다른 위치 선택');
  await wait(() => document.body.textContent.includes('생성 위치: 검증 자료 B'));
  check('location selection writes zero', await page.eval(() => listingProbe.productWrites === 0));
  await page.eval(() => {
    const query = FileSystemHandle.prototype.queryPermission;
    const request = FileSystemHandle.prototype.requestPermission;

    listingProbe.parentWriteState = 'prompt';
    FileSystemHandle.prototype.queryPermission = async function (options) {
      if (this.name === '검증 자료 B' && options.mode === 'readwrite') return listingProbe.parentWriteState;

      return query.call(this, options);
    };
    FileSystemHandle.prototype.requestPermission = async function (options) {
      if (this.name === '검증 자료 B' && options.mode === 'readwrite') {
        listingProbe.parentWriteState = listingProbe.denyVaultWrite ? 'denied' : 'granted';

        const result = await request.call(this, options);

        return listingProbe.denyVaultWrite ? 'denied' : result;
      }

      return request.call(this, options);
    };
  });
  await page.setViewport({ width: 390, height: 900 });
  check(
    'creation form is contained at 390px',
    await page.eval(() => document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth)
  );
  await page.screenshot({ path: `${out}/creation-390.png`, format: 'png' });
  await page.setViewport({ width: 1440, height: 900 });
  await page.eval(() => {
    listingProbe.denyVaultWrite = true;
  });
  await click('이 위치에 보관함 생성');
  await wait(done);
  check(
    'denied write reports permission stage',
    await page.eval(() => document.body.textContent.includes('쓰기 권한 확인 실패') && document.body.textContent.includes('request-write / permission'))
  );
  check('denied write creates no folder', await page.eval(async () => {
    for await (const entry of listingProbe.b.values()) if (entry.name.startsWith('모아 복구 보관함-')) return false;

    return listingProbe.productWrites === 0;
  }));
  await page.eval(() => {
    listingProbe.denyVaultWrite = false;
  });
  await click('이 위치에 보관함 생성');
  await wait(connected);
  check(
    'separate creation requests permission in a user gesture',
    await page.eval(() => listingProbe.parentWriteState === 'granted' && listingProbe.requestsActive.every(Boolean))
  );
  timings.push({ operation: 'create-and-verify', elapsedMs: Date.now() - started });
  check('vault created outside source', await page.eval(async () => {
    const dirs = [];

    for await (const [name, handle] of listingProbe.b.entries()) if (name.startsWith('모아 복구 보관함-')) dirs.push(handle);

    listingProbe.vault = dirs[0];

    const file = await (await listingProbe.vault.getFileHandle('.moa-vault.json')).getFile();
    const identity = JSON.parse(await file.text());

    return dirs.length === 1 && identity.kind === 'moa-recovery-vault' && identity.owner.userId === 'development-local';
  }));

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 220));
    check(
      `no overflow ${width}`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth
        && document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth)
    );
    await page.screenshot({ path: `${out}/vault-${width}.png`, format: 'png' });
  }

  await click('보관함 연결 해제');
  await wait(done);
  check(
    'disconnect preserves vault identity',
    await page.eval(async () => (await (await listingProbe.vault.getFileHandle('.moa-vault.json')).getFile()).size > 0)
  );
  await click('기존 보관함 연결');
  await wait(done);
  check(
    'normal folder is not adopted',
    await page.eval(() => document.body.textContent.includes('복구 보관함이 아닙니다'))
  );
  await page.eval(() => {
    window.showDirectoryPicker = async () => listingProbe.vault;
  });
  await click('기존 보관함 연결');
  await wait(connected);
  check(
    'source sentinel unchanged',
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  await click('연결 마치기');
  check(
    'explicit finish closes setup',
    await page.eval(() => !document.querySelector('dialog:modal') && location.pathname === '/files')
  );
  // 이미 허용된 연결은 queryPermission으로 복원하며 권한창을 열지 않는다.
  await page.goto(base + '/files', { settleMs: 350 });
  await click('폴더 연결 관리');
  await wait(connected);
  check(
    'reload resumes granted source and validates the vault without permission prompts',
    await page.eval(() => listingProbe.permissionRequests === 0 && listingProbe.productWrites === 0)
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );
  check(
    'Escape closes and restores focus',
    await page.eval(() => !document.querySelector('dialog:modal') && document.activeElement?.getAttribute('aria-label') === '폴더 연결 관리')
  );
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify({ checks, timings, errors: page?.consoleErrors }, null, 2)
  );
  await browser.close();
}

console.log(`${checks.length} recovery connection checks passed`);
