import assert from 'node:assert/strict';
import { finishSourceSetup, waitForVisibleAction } from '../fixtures/finish-source-setup.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/plan-feedback/browser';

mkdirSync(out, { recursive: true });

const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
const checks = [];
const samples = [];
let page;

function check(name, passed, detail) {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
}

async function wait(predicate) {
  for (let index = 0; index < 300; index++) {
    if (await page.eval(predicate)) return;

    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw Error(`Timeout: ${predicate}`);
}

async function click(label) {
  await waitForVisibleAction(page, label);

  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const element = [...root.querySelectorAll('button,summary')].find(element =>
      element.checkVisibility() && !element.disabled
      &&
      (element.textContent.trim() === label || element.getAttribute('aria-label') === label));

    if (!element) throw Error(`Missing ${label}`);

    element.scrollIntoView({ block: 'center' });

    const bounds = element.getBoundingClientRect();

    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }, label);

  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  }
}

async function measureRepeat(label, kind) {
  return page.eval(async ({ label, kind }) => {
    const dialog = document.querySelector('dialog:modal');
    const previous = dialog.querySelector('[aria-label="변경 계획 결과"]');
    const button = [...dialog.querySelectorAll('button')].find(element => element.textContent === label);
    const start = performance.now();
    const frames = [];

    button.click();

    while (performance.now() - start < 750) {
      await new Promise(requestAnimationFrame);

      const phase = kind === 'plan' ? dialog.dataset.planPhase : dialog.querySelector('[data-copy-inspection]')?.dataset.copyInspection;
      const inspect = [...dialog.querySelectorAll('button')].find(element => element.textContent === '복사 전 검사');

      frames.push({
        t: performance.now() - start,
        phase,
        step: dialog.dataset.workStep,
        top: dialog.getBoundingClientRect().top,
        previousAlive: !previous || previous.isConnected,
        staleActionBlocked: !inspect || inspect.disabled,
        bodyOpacity: getComputedStyle(dialog).opacity,
      });

      if (phase === 'ready') break;
    }

    return { kind, frames };
  }, { label, kind });
}

try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(base + '/files', { settleMs: 250 });
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await revealSelectionControl(page, '읽기 안내.md 선택');
  await click('복사');
  await click('목적지 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`three distinct picker regions at ${width}`, await page.eval(() => {
      const creation = document.querySelector('[aria-label="현재 위치에 새 항목 만들기"]');
      const choose = document.querySelector('[aria-label$="폴더를 목적지로 선택"]');
      const folders = document.querySelector('[aria-label="목적지 하위 폴더"]');
      const style = getComputedStyle(creation);

      return style.borderTopWidth === '1px' && style.backgroundColor !== getComputedStyle(creation.parentElement).backgroundColor
        && !creation.contains(choose)
        && !creation.contains(folders)
        && document.querySelector('[data-destination-phase] h4').textContent === '하위 폴더';
    }));
    check(`picker contained at ${width}`, await page.eval(() => {
      const dialog = document.querySelector('dialog:modal');

      return dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    }));
    await page.screenshot({ path: `${out}/picker-${width}.png`, format: 'png' });
  }

  await click('빈 폴더 목적지 폴더 열기');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  await click('빈 폴더 폴더를 목적지로 선택');
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');

  for (let index = 0; index < 5; index++) {
    const sample = await measureRepeat('계획 다시 확인', 'plan');

    samples.push(sample);

    const loading = sample.frames.filter(frame => frame.phase === 'loading');
    const done = sample.frames.at(-1);

    check(
      `recheck ${index} retains old plan and blocks its action`,
      loading.length > 0 && loading.every(frame => frame.previousAlive && frame.staleActionBlocked)
    );
    check(
      `recheck ${index} displays pending at least 360ms`,
      done.phase === 'ready' && done.t >= 350,
      { elapsedMs: done.t }
    );
    check(
      `recheck ${index} keeps dialog stable`,
      sample.frames.every(frame => frame.bodyOpacity === '1')
      && Math.max(...sample.frames.map(frame => frame.top)) - Math.min(...sample.frames.map(frame => frame.top)) < 1
    );
  }

  await click('복사 전 검사');
  await wait(() => document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === 'ready');

  for (let index = 0; index < 5; index++) {
    const sample = await measureRepeat('파일 다시 검사', 'inspection');

    samples.push(sample);

    const done = sample.frames.at(-1);

    check(
      `inspection ${index} never returns to the destination step`,
      sample.frames.every(frame => frame.step === '2' && ['loading', 'ready'].includes(frame.phase))
    );
    check(
      `inspection ${index} has visible pending feedback`,
      done.phase === 'ready' && done.t >= 350,
      { elapsedMs: done.t }
    );
  }

  await click('파일 다시 검사');
  await click('검사 취소');
  await new Promise(resolve => setTimeout(resolve, 450));
  check(
    'cancel during success hold cannot resurrect approval',
    await page.eval(() => document.querySelector('[data-plan-phase]').dataset.workStep === '1'
      && !document.querySelector('[data-copy-inspection]'))
  );
  await click('계획 다시 확인');
  await click('계획 읽기 취소');
  await new Promise(resolve => setTimeout(resolve, 450));
  check(
    'plan cancel during success hold cannot resurrect preview',
    await page.eval(() => document.querySelector('[data-plan-phase]').dataset.planPhase === 'draft'
      && !document.querySelector('[aria-label="변경 계획 결과"]'))
  );
  check(
    'no writes or permission request',
    await page.eval(async () => listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0
      && JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify({ checks, samples, errors: page?.consoleErrors }, null, 2)
  );
  await browser.close();
}

console.log(`${checks.length} plan feedback checks passed`);
