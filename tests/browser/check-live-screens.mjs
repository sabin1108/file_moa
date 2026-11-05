import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3001';
const out = process.argv[3] || 'docs/verification/live-workspace';
mkdirSync(out, { recursive: true });
const checks = [];
const visualFindings = [];
const browser = await Browser.launch();

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  assert.ok(passed, name);
}

try {
  // 이 검사는 가짜 성공 상태를 주입하지 않는다. 실제 라우트의 DOM과 링크를 검사한다.
  for (const route of ['/', '/files', '/settings', '/login', '/welcome']) {
    const page = await browser.newPage({ width: 1440, height: 1000 });
    await page.goto(base + route, { settleMs: 400 });
    const state = await page.eval(() => ({
      live: !!document.querySelector('[data-workspace="live"]'),
      text: document.body.innerText,
      dialogs: document.querySelectorAll('[aria-haspopup="dialog"]').length,
      enabledInputs: document.querySelectorAll('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)').length,
      buttons: [...document.querySelectorAll('button:not(:disabled)')].map(el => el.textContent.trim()),
    }));
    check(`${route}: actual workspace, no sample dialogs or editable fake settings`, state.live && state.dialogs === (route === '/files' ? 1 : 0) && state.enabledInputs === 0, state);
    check(`${route}: no fabricated account or sample conversation`, !/sabin|Google로 연결한 예시 계정|리액트 화면이 느릴 때는|프론트엔드 공부/.test(state.text));
    if (route === '/settings' || route === '/files') {
      check(`${route}: real folder settings are reachable`, await page.eval(() => !!document.querySelector('[aria-label="자료 폴더 연결 설정"]') || !!document.querySelector('button[aria-haspopup="dialog"]')));
    } else {
      check(`${route}: unavailable feature has an honest explanation and no action simulation`, state.text.includes('아직 구현되지 않았') && state.buttons.length === 0, state.buttons);
    }
    for (const width of [1440, 1920, 768, 390]) {
      await page.setViewport({ width, height: 1000 });
      check(`${route} ${width}: no horizontal overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
      const measured = await page.eval(probe);
      const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })]
        .filter(finding => !APP_SKIP.has(finding.id) && finding.id !== 'no-title' && finding.id !== 'small-title');
      findings.push(...judgeApp(await page.eval(app), measured, { width }));
      visualFindings.push({ route, width, findings });
      await page.screenshot({ path: `${out}/${route.slice(1) || 'chat'}-${width}.png`, format: 'png', fullPage: true });
    }
    if (route === '/') {
      await page.eval(() => document.querySelector('[aria-label="모바일 주 메뉴"] a').focus());
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      check('mobile: Tab reaches the actual files link', await page.eval(() => document.activeElement?.getAttribute('href') === '/files'));
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      for (let attempt = 0; attempt < 40; attempt++) {
        if (await page.eval(() => location.pathname === '/files' && !!document.querySelector('[aria-label="자료 폴더 탐색"]'))) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      check('mobile: Enter navigates to the actual files screen', await page.eval(() => location.pathname === '/files' && !!document.querySelector('[data-workspace="live"]')));
    }
    check(`${route}: no browser exception`, page.consoleErrors.length === 0, page.consoleErrors);
    await page.close();
  }

  for (const route of ['/preview', ...['chat', 'files', 'settings', 'login', 'welcome'].map(name => `/preview/screens/${name}`), '/preview/folder-connection']) {
    const page = await browser.newPage({ width: 1440, height: 1000 });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.connectionIO = [];
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (...args) {
        window.connectionIO.push('indexedDB.open');
        return open.apply(this, args);
      };
      window.showDirectoryPicker = () => { window.connectionIO.push('picker'); throw new Error('Preview must not open picker'); };
    ` });
    await page.goto(base + route, { settleMs: 350 });
    check(`${route}: retained with explicit sample boundary`, await page.eval(() => !!document.querySelector('[aria-label="시안 안내"]') && !document.querySelector('[data-workspace="live"]')));
    if (route === '/preview/screens/settings') {
      check('preview settings: login link stays within preview', await page.eval(() => [...document.querySelectorAll('a')].some(link => link.textContent.includes('로그인 화면 보기') && link.getAttribute('href') === '/preview/screens/login')));
      await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === '연결').click());
      await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === '폴더 연결').click());
      check('preview settings: action is a labelled call record only', await page.eval(() => document.body.innerText.includes('마지막 호출: 폴더 연결')));
    }
    check(`${route}: no real folder connection or persistence`, await page.eval(() => window.connectionIO.length === 0 && !document.querySelector('[aria-label="자료 폴더 연결 설정"]')));
    if (route === '/preview' || route === '/preview/screens/settings') {
      for (const width of [1440, 390]) {
        await page.setViewport({ width, height: 1000 });
        check(`${route} ${width}: preview notice stays in viewport`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `${out}/${route === '/preview' ? 'preview-catalog' : 'preview-settings'}-${width}.png`, format: 'png', fullPage: true });
      }
    }
    check(`${route}: no browser exception`, page.consoleErrors.length === 0, page.consoleErrors);
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/screen-checks.json`, JSON.stringify({ at: new Date().toISOString(), base, checks, visualFindings }, null, 2));
}
console.log(JSON.stringify({ checks: checks.length, failed: checks.filter(check => !check.passed).length }));
