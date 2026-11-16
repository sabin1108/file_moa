import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { workspaceStepsFor } from "../../apps/web/src/features/onboarding/workspace-tour-steps.ts";

const base = process.argv[2] ?? "http://127.0.0.1:3034";
const output = process.argv[3] ?? ".omx/verification/demo-product-ui-20261116/browser";
mkdirSync(output, { recursive: true });
const checks = [];
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
const click = (page, selector) => page.eval(selector => {
  const button = document.querySelector(selector);
  if (!button) throw Error(`Missing ${selector}`);
  button.click();
}, selector);
async function wait(page, predicate, argument) {
  for (let index = 0; index < 180; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})(${JSON.stringify(argument)}))`)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Missing expected state: ${predicate}`);
}
const saved = page => page.eval(() => JSON.parse(Object.entries(sessionStorage).find(([key]) => key.startsWith("moa.sample.v1."))?.[1] ?? "null"));
const choose = (page, mode) => page.eval(mode => {
  const select = document.querySelector('select[aria-label="대화 작업"]');
  select.value = mode;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}, mode);
async function example(page, mode) {
  await page.eval(() => { document.querySelector('[aria-label="현재 대화 작업"] details').open = true; });
  await click(page, `[data-task-example="${mode}"]`);
  await wait(page, () => document.getElementById('message-draft')?.value.trim().length > 0
    );
}

let page;
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  let posts = 0;
  await page.send("Network.enable");
  browser.on(page.sessionId, "Network.requestWillBeSent", event => { if (event.request.method === "POST") posts++; });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.demoIO=[];
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(...args){window.demoIO.push('idb'); return open.apply(this,args)};
    window.showDirectoryPicker=()=>{window.demoIO.push('picker');throw Error('no personal folder')};
    window.showOpenFilePicker=()=>{window.demoIO.push('file');throw Error('no personal file')};
  ` });
  await page.goto(base + (process.env.MOA_DEMO_INVITE_PATH ?? '/demo/intro'), { settleMs: 300 });
  check('introduction does not consume or display the workspace guide', await page.eval(() => !document.querySelector('#workspace-tour-title') && !Object.keys(sessionStorage).some(key => key.startsWith('moa.sample.guide.'))));
  await page.goto(base + '/demo/start?intro=done', { settleMs: 300 });
  const steps = workspaceStepsFor('sample');
  for (const [index, step] of steps.entries()) {
    await wait(page, expected => document.querySelector('#workspace-tour-title')?.textContent === expected
      && document.querySelector('dialog[aria-labelledby="workspace-tour-title"]')?.getAttribute('aria-busy') === 'false', step.title);
    check(`shared tour ${index + 1}/${steps.length} highlights the actual product control`, await page.eval(selector => [...document.querySelectorAll(selector)].some(node => node.checkVisibility()), step.selector));
    if (step.recordKind) check(`tour previews ${step.recordKind} without a modal conflict`, await page.eval(kind => {
      const panel = document.getElementById('conversation-materials');
      return panel.open && !panel.matches(':modal') && document.querySelector(`[data-tour="record-${kind}"]`).getAttribute('aria-pressed') === 'true';
    }, step.recordKind));
    await click(page, 'dialog[aria-labelledby="workspace-tour-title"] section > div:last-child button:last-child');
  }
  await wait(page, () => location.pathname === '/demo' && !document.querySelector('#workspace-tour-title'));
  check('tour changes no task selection or document selection', (await saved(page)) === null || ((await saved(page)).selected.length === 0 && (await saved(page)).mode === null));
  check('the six-step demo-only guide is removed', await page.eval(() => !document.querySelector('[data-demo-guide]')));
  await click(page, '[data-tour="task-chat"]');
  check('shared task selector has the product control styling', await page.eval(() => {
    const input = document.querySelector('select[aria-label="대화 작업"]');
    return parseFloat(getComputedStyle(input).minHeight) >= 36 && input.parentElement.className.includes('modeChoice');
  }));
  check('task meaning remains visible outside the examples', await page.eval(() => document.querySelector('[aria-label="현재 대화 작업"]').textContent.includes('궁금한 내용을 바로 질문해요')));
  await example(page, 'chat');
  check('an example only fills the draft and does not submit', (await saved(page)).messages.length === 0 && (await saved(page)).draft.length > 0);
  await page.goto(base + '/demo/files', { settleMs: 300 });
  await wait(page, () => document.querySelector('[data-listing-phase="ready"]'));
  check('sample folders use the product listing and start unchecked', await page.eval(() => !!document.querySelector('[aria-label="자료 폴더 탐색"]') && !document.querySelector('[data-tour="folder-list"] input:checked')));
  await page.eval(() => [...document.querySelectorAll('[data-tour="folder-list"] button')].find(button => button.textContent.trim() === '검색').click());
  await page.eval(() => document.querySelector('[role="search"] input').focus());
  await page.send('Input.insertText', { text: '웹사이트' });
  await wait(page, () => document.querySelector('[aria-label="하위 폴더 포함 검색 결과"] [aria-label$="미리보기"]'));
  await page.eval(() => document.querySelector('[aria-label="하위 폴더 포함 검색 결과"] [aria-label$="미리보기"]').focus());
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  check('selecting a nested filename search result checks exactly that sample', (await saved(page)).selected.length === 1);
  const chosenFile = (await saved(page)).selected[0];
  await page.eval(() => document.querySelector('[role="search"] input').focus());
  await page.send('Input.insertText', { text: '웹사이트' });
  await wait(page, () => document.querySelector('[aria-label="하위 폴더 포함 검색 결과"] [aria-label$="미리보기"]'));
  await page.eval(() => document.querySelector('[aria-label="하위 폴더 포함 검색 결과"] [aria-label$="미리보기"]').focus());
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  check('choosing an already-selected search result preserves explicit selection', (await saved(page)).selected.length === 1 && (await saved(page)).selected[0] === chosenFile);
  await page.goto(base + '/demo', { settleMs: 300 });
  await wait(page, () => document.querySelector('select[aria-label="대화 작업"]'));
  check('refresh and route changes do not automatically restart the tour', await page.eval(() => !document.querySelector('#workspace-tour-title')));
  await choose(page, 'find');
  await example(page, 'find');
  await click(page, '[data-action="organization-send"]');
  await wait(page, () => document.querySelector('[aria-label="샘플 검색 결과"]'));
  check('sample search still returns real excerpt matches', (await saved(page)).findings.length > 0);
  await click(page, '[data-drawer-close]');
  await wait(page, () => document.getElementById('conversation-materials')?.dataset.drawerState === 'closed');
  await choose(page, 'grounded');
  await example(page, 'grounded');
  check('offline verification cannot send a grounded request or substitute a prepared answer', await page.eval(() =>
    document.querySelector('[data-action="organization-send"]').disabled && !document.querySelector('[aria-label="답변 출처"]')));
  await click(page, '[data-tour="records"]');
  await click(page, '[data-tour="record-wiki"]');
  check('demo records use the same category tabs as the product', await page.eval(() => !!document.querySelector('nav[aria-label="보관 기록 종류"] [data-tour="record-wiki"] svg')));
  await click(page, '[data-drawer-close]');
  await wait(page, () => document.getElementById('conversation-materials')?.dataset.drawerState === 'closed');
  for (const width of [390, 768, 1440]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: product controls have no horizontal overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/shared-${width}.png`, format: 'png', fullPage: true });
  }
  await page.eval(() => document.querySelector('[data-tour="settings"]').focus());
  await click(page, '[data-tour="settings"]');
  await wait(page, () => document.querySelector('[aria-label="대화 설정 내용"]')?.checkVisibility());
  check('shared settings describe sample storage accurately', await page.eval(() => document.querySelector('[aria-label="대화 설정 내용"]').textContent.includes('새로고침해도 복원')));
  await click(page, '[data-drawer-close]');
  await wait(page, () => document.getElementById('conversation-materials')?.dataset.drawerState === 'closed');
  check('closing shared context panels returns focus to their trigger', await page.eval(() => document.activeElement === document.querySelector('[data-tour="settings"]')));
  await click(page, '[data-tour="settings"]');
  await page.eval(() => [...document.querySelectorAll('[aria-label="대화 설정 내용"] button')].find(button => button.textContent === '사용 방법 다시 보기').click());
  await wait(page, () => !!document.querySelector('#workspace-tour-title'));
  check('the existing replay action opens the same 17-step tour', await page.eval(() => document.querySelector('[data-tour-copy]').textContent.includes('17')));
  check('no external AI or server claim POSTs', posts === 0);
  check('no personal folders or IndexedDB accessed', await page.eval(() => window.demoIO.length === 0));
} catch (error) {
  checks.push({ name: 'run', passed: false, detail: String(error) });
  if (page) writeFileSync(`${output}/failure-state.json`, JSON.stringify({ state: await saved(page), page: await page.eval(() => ({ path: location.pathname, text: document.body.innerText.slice(-2500) })) }, null, 2));
  process.exitCode = 1;
} finally {
  writeFileSync(`${output}/checks.json`, JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));
  await browser.close();
}
