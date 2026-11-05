// Run against the local app: node tests/browser/check-folder-connection-ui.mjs [base URL]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3000';
const out = 'docs/verification/source-folder-connection';
mkdirSync(out, { recursive: true });
const checks = [];
const frames = [];
const browser = await Browser.launch();
const settle = () => new Promise(resolve => setTimeout(resolve, 120));
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
};
const click = async (page, scope, label) => {
  const found = await page.eval(({ scope, label }) => {
    const button = [...document.querySelectorAll(`${scope} button`)].find(el => el.textContent === label);
    if (!button) return false;
    button.click();
    return true;
  }, { scope, label });
  assert.ok(found, `Missing button: ${label}`);
  await settle();
};
const key = async (page, key, code, virtualKey) => {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
  await settle();
};
const scope = 'section[aria-label="자료 폴더 연결"]';
const cases = [
  { label: '미연결', status: '미연결', name: '연결한 폴더 없음', actions: ['폴더 연결'] },
  { label: '다시 연결 필요', status: '다시 연결 필요', name: '학습 노트', actions: ['다시 연결', '연결 해제'] },
  { label: '연결됨', status: '연결됨', name: '학습 노트', actions: ['연결 해제'] },
  { label: '긴 이름', status: '연결됨', name: '2026년_프로젝트별_학습기록과참고자료를모아둔아주긴폴더이름_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', actions: ['연결 해제'] },
];

try {
  for (const width of [1440, 1920, 768, 390]) {
    const page = await browser.newPage({ width, height: 900 });
    await page.goto(`${base}/preview/folder-connection`, { settleMs: 500 });
    for (const item of cases) {
      await click(page, 'fieldset', item.label);
      const view = await page.eval(scope => {
        const row = document.querySelector(scope);
        return {
          title: row.querySelector('h3').textContent,
          status: row.querySelector('span').textContent,
          actions: [...row.querySelectorAll('button')].map(el => el.textContent),
          overflow: document.documentElement.scrollWidth > innerWidth || [...row.querySelectorAll('*')].some(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1),
          minHeight: Math.min(...[...row.querySelectorAll('button')].map(el => el.getBoundingClientRect().height)),
          record: document.querySelector('[role="status"]').textContent,
        };
      }, scope);
      check(`${width} ${item.label}: name/status/actions`, view.title === item.name && view.status === item.status && JSON.stringify(view.actions) === JSON.stringify(item.actions), view);
      check(`${width} ${item.label}: fit/target size`, !view.overflow && view.minHeight >= (width === 390 ? 44 : 40), view);
      check(`${width} ${item.label}: fresh callback log`, view.record.startsWith('호출 기록 없음'), view.record);
      let count = 0;
      for (const action of item.actions) {
        await click(page, scope, action);
        count++;
        const result = await page.eval(scope => ({ record: document.querySelector('[role="status"]').textContent, status: document.querySelector(scope).querySelector('span').textContent }), scope);
        check(`${width} ${item.label}: ${action} callback once, input preserved`, result.record === `마지막 호출: ${action} · 누른 횟수: ${count}회` && result.status === item.status, result);
      }
      if ((width === 1440 || width === 390) && (item.label === '긴 이름' || item.label === '다시 연결 필요')) {
        const path = `${out}/${width}-${item.label === '긴 이름' ? 'long-name' : 'permission'}.png`;
        await page.screenshot({ path, format: 'png' });
        frames.push(path);
      }
    }
    await click(page, 'fieldset', '다시 연결 필요');
    await page.eval(scope => document.querySelector(scope).querySelector('button').focus(), scope);
    await key(page, 'Enter', 'Enter', 13);
    const enterResult = await page.eval(() => ({ text: document.querySelector('[role="status"]').textContent, focus: document.activeElement.textContent }));
    check(`${width} Enter calls reconnect`, enterResult.text === '마지막 호출: 다시 연결 · 누른 횟수: 1회', enterResult);
    await key(page, 'Tab', 'Tab', 9);
    const focus = await page.eval(() => ({ text: document.activeElement.textContent, outline: getComputedStyle(document.activeElement).outlineStyle, width: getComputedStyle(document.activeElement).outlineWidth }));
    check(`${width} Tab order and visible focus`, focus.text === '연결 해제' && focus.outline !== 'none' && parseFloat(focus.width) > 0, focus);
    await key(page, ' ', 'Space', 32);
    check(`${width} Space calls disconnect`, await page.eval(() => document.querySelector('[role="status"]').textContent === '마지막 호출: 연결 해제 · 누른 횟수: 2회'));
    check(`${width} callback log is sole live region in scene`, await page.eval(() => document.querySelector('[role="status"]').parentElement.closest('[aria-live]') === null));
    check(`${width} no browser exceptions`, page.consoleErrors.length === 0, page.consoleErrors);
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base, scope: 'Synthetic display/callback review only; no native picker, storage or login integration', checks, frames }, null, 2));
}
console.log(JSON.stringify({ passed: checks.filter(item => item.passed).length, failed: checks.filter(item => !item.passed).length, frames }, null, 2));
