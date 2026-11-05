import assert from 'node:assert/strict';
import { finishSourceSetup, waitForVisibleAction } from '../fixtures/finish-source-setup.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3005';
const out = process.argv[3] || 'docs/verification/feature-classification/navigation';
mkdirSync(out, { recursive: true });
const checks = [];
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
let page;
const check = (name, passed) => { checks.push({ name, passed }); assert.ok(passed, name); };
async function wait(fn, argument) {
  for (let n = 0; n < 120; n++) {
    if (await page.eval(fn, argument)) return;
    await new Promise(done => setTimeout(done, 50));
  }
  throw Error(`Timeout: ${fn}`);
}
const idle = () => wait(() => !document.querySelector('[aria-label="자료 폴더 연결 설정"] [data-state="pending"]'));
async function click(label) {
  await waitForVisibleAction(page, label);
  const position = await page.eval(label => {
    const element = [...document.querySelectorAll('button')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label) && el.getClientRects().length && !el.disabled);
    if (!element) throw Error(`Missing button: ${label}`);
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, label);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 });
}
async function navigate(path) {
  await page.eval(path => [...document.querySelectorAll('a')].find(el => el.getAttribute('href') === path && el.getClientRects().length).click(), path);
  await wait(path => location.pathname === path, path);
}
function installDeferredPicker() {
  const picker = window.showDirectoryPicker;
  window.navigationProbe = { hold: false, gates: [], active: [] };
  window.showDirectoryPicker = async (...args) => {
    navigationProbe.active.push(navigator.userActivation.isActive);
    if (navigationProbe.hold) await new Promise(resolve => navigationProbe.gates.push(resolve));
    return picker(...args);
  };
}
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();(${installDeferredPicker.toString()})();` });
  await page.goto(base + '/settings', { settleMs: 200 }); await idle();
  await page.eval(() => { listingProbe.pickerMode = 'cancel'; });
  await click('폴더 연결'); await idle();
  check('cancel stays on settings', await page.eval(() => location.pathname === '/settings' && document.body.textContent.includes('폴더 연결을 마치지 않았어요.')));
  await page.eval(() => { listingProbe.pickerMode = 'success'; listingProbe.failWrite = true; });
  await click('폴더 연결'); await idle();
  check('save failure stays on settings', await page.eval(() => location.pathname === '/settings' && document.body.textContent.includes('폴더 연결 처리에 실패')));
  await page.eval(() => { listingProbe.failWrite = false; });
  await click('폴더 연결');
  await idle();
  check('source connect stays on settings and focuses vault', await page.eval(() => location.pathname === '/settings' && document.activeElement?.textContent === '복구 보관함'));
  await finishSourceSetup(page);
  await wait(() => location.pathname === '/files' && document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  check('successful connect opens files with real listing', await page.eval(() => document.body.textContent.includes('읽기 안내.md') && navigationProbe.active.every(Boolean)));
  check('opening files does not read bodies or write sources', await page.eval(() => listingProbe.productBodyReads === 0 && listingProbe.productWrites === 0));
  await page.screenshot({ path: `${out}/connected-1440.png`, format: 'png', fullPage: true });
  await navigate('/settings'); await idle();
  check('revisiting settings does not redirect from existing connected state', await page.eval(() => location.pathname === '/settings'));
  await page.eval(() => { listingProbe.pickerMode = 'cancel'; });
  await click('다른 폴더 선택'); await idle();
  check('cancel with old connection does not navigate', await page.eval(() => location.pathname === '/settings' && document.body.textContent.includes('검증 자료 A')));
  await page.eval(() => { listingProbe.pickerMode = 'success'; navigationProbe.hold = true; });
  await click('다른 폴더 선택'); await wait(() => navigationProbe.gates.length > 0);
  await navigate('/');
  await navigate('/settings');
  await wait(() => !!document.querySelector('[aria-label="자료 폴더 연결 설정"] [data-state="pending"]'));
  await page.eval(() => { navigationProbe.hold = false; navigationProbe.gates.splice(0).forEach(done => done()); });
  // 완료 상태를 관찰할 때까지 기다린 뒤, 이미 떠난 화면을 늦은 작업이 바꾸지 않았는지 확인한다.
  await idle();
  await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('late completion never opens files after leaving initiating component', await page.eval(() => location.pathname === '/settings'));
  await page.goto(base + '/settings', { settleMs: 200 }); await idle();
  check('stored handle restore does not auto-navigate', await page.eval(() => location.pathname === '/settings' && document.body.textContent.includes('다시 연결 필요')));
  await page.eval(() => { listingProbe.permission = 'denied'; });
  await click('다시 연결'); await idle();
  check('reconnect permission denial stays on settings', await page.eval(() => location.pathname === '/settings'));
  await page.eval(() => { listingProbe.permission = 'granted'; });
  await click('다시 연결');
  await finishSourceSetup(page);
  await wait(() => location.pathname === '/files' && document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  check('explicit reconnect success opens files', await page.eval(() => listingProbe.requestsActive.every(Boolean)));
  const historyLength = await page.eval(() => history.length);
  await click('폴더 연결 관리');
  await click('다른 폴더 선택'); await idle();
  await finishSourceSetup(page);
  check('connect within files does not push another history entry', await page.eval(length => location.pathname === '/files' && history.length === length, historyLength));
  await page.setViewport({ width: 390, height: 1000 });
  await page.screenshot({ path: `${out}/connected-390.png`, format: 'png', fullPage: true });
  check('narrow screen has no horizontal overflow', await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
  check('browser has no console errors', page.consoleErrors.length === 0);
} finally {
  writeFileSync(`${out}/checks.json`, JSON.stringify({ at: new Date().toISOString(), base, checks, consoleErrors: page?.consoleErrors, boundary: 'Real route/controller/IDB/OPFS; synthetic picker and permissions; no personal files' }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, failed: checks.filter(c => !c.passed) }));
  await browser.close();
}
