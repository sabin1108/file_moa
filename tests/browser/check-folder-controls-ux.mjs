import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
// User-visible selection affordance and refresh geometry; real UI with isolated synthetic folders.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3010';
const out = process.argv[3] || 'docs/verification/folder-controls-ux/browser';

mkdirSync(out, { recursive: true });

const checks = [], refresh = [];
const browser = await Browser.launch();
let page;
const check = (name, passed, detail) => checks.push({ name, passed: !!passed, detail });

async function wait(fn) {
  for (let n = 0; n < 160; n++) {
    if (await page.eval(fn)) return;

    await new Promise(r => setTimeout(r, 50));
  }

  throw Error(`Timeout: ${fn}`);
}

async function click(label) {
  const rect = await page.eval(label => {
    const root = document.querySelector('dialog[open]') ?? document;
    const el = [...root.querySelectorAll('button,input')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label) && el.getClientRects().length
      && !el.disabled);

    if (!el) throw Error(`Missing control: ${label}`);

    const r = el.getBoundingClientRect();

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);

  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...rect, button: 'left', clickCount: 1 });
}

const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const geometry = () => page.eval(() => {
  const row = document.querySelector('[aria-label="파일과 하위 폴더"] > li').getBoundingClientRect();
  const heading = document.querySelector('[data-listing-phase] h2').getBoundingClientRect();
  const control = document.querySelector('[title="새로고침"], [title="읽기 취소"]').getBoundingClientRect();

  return { rowX: row.x, rowY: row.y, headingY: heading.y, controlX: control.x, controlY: control.y, scrollY };
});

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
  await ready();
  check('REFRESH-UX-001 refresh drawing fits its viewport', await page.eval(() => {
    const svg = document.querySelector('[aria-label="새로고침"] svg');
    const b = svg.querySelector('path').getBBox(), r = svg.getBoundingClientRect();

    return b.x >= 1 && b.y >= 1 && b.x + b.width <= 23 && b.y + b.height <= 23 && r.width >= 18 && r.height >= 18;
  }));

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await page.eval(() => scrollTo(0, 0));

    for (let run = 1; run <= 3; run++) {
      const before = await geometry();

      await page.eval(() => {
        listingProbe.holdRead = true;
      });
      await click('새로고침');
      await wait(() => listingProbe.holds.length > 0);

      const during = await geometry();

      check(
        `REFRESH-UX-002/${width}/${run} visible refresh status`,
        await page.eval(() => document.querySelector('[data-listing-phase]').innerText.includes('갱신 중'))
      );
      await page.eval(() => {
        listingProbe.holdRead = false;
        listingProbe.holds.splice(0).forEach(done => done());
      });
      await ready();

      const after = await geometry();
      const delta = Math.max(...Object.keys(before).flatMap(k => [Math.abs(during[k] - before[k]), Math.abs(after[k] - before[k])]));

      refresh.push({ width, run, before, during, after, delta });
      check(`REFRESH-UX-002/${width}/${run} unchanged rows and toolbar`, delta <= 1, { delta });
    }

    await page.screenshot({ path: `${out}/files-${width}.png`, fullPage: true });
  }

  await page.setViewport({ width: 390, height: 900 });
  await click('선택');
  await click('읽기 안내.md 선택');
  await click('변경 계획 검토');
  await click('폴더에서 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  check(
    'PICK-UX-001 draft controls hidden while browsing',
    await page.eval(() => !document.querySelector('[data-plan-phase] input').getClientRects().length)
  );
  check(
    'PICK-UX-002 no redundant root/up buttons at root',
    await page.eval(() => ![...document.querySelectorAll('[data-destination-phase] button')].some(b => ['연결 폴더', '상위 폴더'].includes(b.textContent.trim())))
  );

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`PICK-UX-003/${width} named primary selection visible above folders`, await page.eval(() => {
      const picker = document.querySelector('[data-destination-phase]');
      const choose = [...picker.querySelectorAll('button')].find(b => b.textContent.includes('이 폴더를 목적지로 선택'));

      if (!choose || !choose.textContent.includes('검증 자료 A')) return false;

      const r = choose.getBoundingClientRect(), list = picker.querySelector('ul').getBoundingClientRect();

      return r.top >= 0 && r.bottom <= innerHeight && r.bottom <= list.top && document.documentElement.scrollWidth <= innerWidth;
    }));
    await page.screenshot({ path: `${out}/picker-${width}.png`, fullPage: true });
  }

  await page.setViewport({ width: 390, height: 900 });
  await click('목적지 탐색 취소');

  const longName = '긴 목적지 폴더 이름 '.repeat(5).trim();

  await page.eval(async name => {
    listingProbe.preparing = true;

    try {
      await listingProbe.a.getDirectoryHandle(name, { create: true });
    }
    finally {
      listingProbe.preparing = false;
    }

    const input = document.querySelector('[data-plan-phase] input');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, name);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, longName);
  await click('폴더에서 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  check('PICK-UX-003 long folder label wraps without overflowing the dialog', await page.eval(name => {
    const dialog = document.querySelector('[data-plan-phase]');
    const choose = document.querySelector('[data-destination-phase] button[aria-label$="폴더를 목적지로 선택"]');
    const r = choose.getBoundingClientRect();

    return choose.textContent.includes(name) && choose.scrollWidth <= choose.clientWidth
      && dialog.scrollWidth <= dialog.clientWidth
      && r.bottom <= innerHeight;
  }, longName));
  await page.screenshot({ path: `${out}/picker-long-390.png`, fullPage: true });
  await click(`${longName} 폴더를 목적지로 선택`);
  check(
    'PICK-UX-003 choice restores input and trigger focus',
    await page.eval(
      name => document.querySelector('[data-plan-phase] input').value === name && document.activeElement.textContent === '폴더에서 선택',
      longName
    )
  );

  const sentinel = await page.eval(async () => ({
    before: listingProbe.before,
    after: await listingProbe.sentinel(),
    writes: listingProbe.productWrites
  }));

  check(
    'source unchanged and no product writes',
    JSON.stringify(sentinel.before) === JSON.stringify(sentinel.after) && sentinel.writes === 0,
    sentinel
  );
  check('no console errors', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify(
      { at: new Date().toISOString(), checks, refresh, consoleErrors: page?.consoleErrors },
      null,
      2
    )
  );
  await browser.close();
}

console.log(JSON.stringify({ checks: checks.length, failures: checks.filter(c => !c.passed) }, null, 2));
assert.equal(checks.filter(c => !c.passed).length, 0, 'UI acceptance checks failed');
