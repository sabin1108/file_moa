import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:3034';
const output = process.argv[3] ?? '.omx/verification/demo-usability-20261116/browser';
mkdirSync(output, { recursive: true });
const browser = await Browser.launch({ extraArgs: ['--disable-gpu', '--no-sandbox'] });
const checks = [];
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
const wait = async (page, predicate) => {
  for (let index = 0; index < 160; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Timed out: ${predicate}`);
};
const click = (page, selector) => page.eval(selector => {
  const node = document.querySelector(selector);
  if (!node) throw Error(`Missing ${selector}`);
  node.click();
}, selector);
const state = page => page.eval(() => JSON.parse(Object.entries(sessionStorage).find(([key]) => key.startsWith('moa.sample.v1.'))?.[1] ?? 'null'));
const dismiss = async page => {
  await wait(page, () => document.querySelector('#workspace-tour-title'));
  await click(page, 'dialog[aria-labelledby="workspace-tour-title"] section > div:last-child button:first-child');
  await wait(page, () => !document.querySelector('#workspace-tour-title'));
};
let page;
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  let posts = 0;
  await page.send('Network.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', event => { if (event.request.method === 'POST') posts++; });
  await page.goto(base + (process.env.MOA_DEMO_INVITE_PATH ?? '/demo/intro'), { settleMs: 400 });
  await click(page, 'a[href="/demo/start?intro=done"]');
  await dismiss(page);
  await click(page, '[data-tour="task-grounded"]');
  await wait(page, () => document.getElementById('conversation-materials')?.open);
  check('starting grounded questions opens source selection without implicit checks', await page.eval(() =>
    [...document.querySelectorAll('[data-tour="folder-list"] input[type="checkbox"]')].some(node => node.checkVisibility())
    && !document.querySelector('[data-tour="folder-list"] input:checked')));
  check('a question cannot be submitted before selecting a file', await page.eval(() => document.querySelector('[data-action="organization-send"]').disabled));
  check('source selection does not offer unsupported folder checkboxes', await page.eval(() => !document.querySelector('[aria-label$=" 폴더 선택"]:not(:disabled)')));
  check('source selection offers selection controls without copy or move actions', await page.eval(() =>
    ![...document.querySelectorAll('[aria-label="파일 선택"] button')].some(node => ['복사', '이동'].includes(node.textContent.trim()))));
  await click(page, '[data-tour="folder-list"] [data-previewing] input[type="checkbox"]');
  await wait(page, () => document.querySelector('[data-tour="folder-list"] [data-previewing] input:checked'));
  await wait(page, () => JSON.parse(Object.entries(sessionStorage).find(([key]) => key.startsWith('moa.sample.v1.'))?.[1] ?? 'null')?.selected.length === 1);
  check('only the explicitly checked source is selected', (await state(page)).selected.length === 1);
  await click(page, '[data-grounded-selection-done]');
  await wait(page, () => !document.getElementById('conversation-materials')?.open);
  check('finishing selection focuses the question input', await page.eval(() => document.activeElement === document.getElementById('message-draft')));
  await page.send('Input.insertText', { text: '선택한 자료를 요약해줘' });
  check('offline source selection keeps explicit files without a prepared answer', (await state(page)).selected.length === 1
    && await page.eval(() => document.querySelector('[data-action="organization-send"]').disabled && !document.querySelector('[aria-label="답변 출처"]')));
  const previous = await state(page);
  await page.goto(base + '/demo/start?intro=done', { settleMs: 400 });
  await wait(page, () => document.querySelector('#workspace-tour-title'));
  check('explicit reentry starts the existing tutorial and preserves the current work', (await state(page)).messages.length === previous.messages.length);
  check('the one-time entry request is removed from the current URL', await page.eval(() => !new URL(location.href).searchParams.has('guide')));
  await page.goto(base + '/demo', { settleMs: 500 });
  check('refresh does not reopen a tutorial that was open before refresh', await page.eval(() => !document.querySelector('#workspace-tour-title')));
  await page.goto(base + '/demo/settings?tab=controls', { settleMs: 400 });
  const replay = 'a[href="/demo?guide=1"]';
  await wait(page, () => document.querySelector('a[href="/demo?guide=1"]'));
  check('the settings replay action uses the common settings row and button control', await page.eval(() => {
    const node = document.querySelector('a[href="/demo?guide=1"]');
    return node.className.includes('secondary') && !!node.closest('div')?.parentElement.querySelector('h3');
  }));
  for (const width of [390, 768, 1440]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: settings have no horizontal overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/settings-${width}.png`, fullPage: true, format: 'png' });
  }
  await click(page, replay);
  await wait(page, () => document.querySelector('#workspace-tour-title'));
  check('the settings action reopens the same 17-step tutorial', await page.eval(() => document.querySelector('[data-tour-copy]').textContent.includes('17')));
  await dismiss(page);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) {
      if (key.startsWith('moa.sample.guide.')) throw new DOMException('Synthetic guide storage denial', 'SecurityError');
      return read.call(this, key);
    };
  ` });
  await page.goto(base + '/demo/start?intro=done', { settleMs: 400 });
  await wait(page, () => document.querySelector('#workspace-tour-title'));
  check('explicit entry still opens the tutorial when guide storage is blocked', true);
  await page.goto(base + '/demo', { settleMs: 500 });
  check('blocked guide storage does not reopen the tutorial on refresh', await page.eval(() => !document.querySelector('#workspace-tour-title')));
  check('demo questions and entry generate no provider or form POSTs', posts === 0);
  await page.goto(base + '/login', { settleMs: 500 });
  await wait(page, () => document.querySelector('form'));
  check('a cookie-less demo visitor reaches the real login form without starting authentication', await page.eval(() => !!document.querySelector('input[type="password"]') && !document.body.innerText.includes('Application error')));
  await page.send('Network.setCookie', { name: 'better-auth.session_token', value: 'synthetic-unverifiable-session', url: base, path: '/', httpOnly: true });
  await page.goto(base + '/login', { settleMs: 500 });
  await wait(page, () => document.querySelector('[data-login-unavailable]'));
  check('a credentialed authentication outage offers retry and demo recovery without granting access', await page.eval(() =>
    !!document.querySelector('[data-login-unavailable] button') && !!document.querySelector('[data-login-unavailable] a[href="/demo"]')
    && !document.querySelector('input[type="password"]')));
} catch (error) {
  checks.push({ name: 'run', passed: false, detail: String(error) });
  if (page) writeFileSync(`${output}/failure.json`, JSON.stringify({ state: await state(page), text: await page.eval(() => document.body.innerText.slice(-4000)) }, null, 2));
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/checks.json`, JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
  await browser.close();
}
