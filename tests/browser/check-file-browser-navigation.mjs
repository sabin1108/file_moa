import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3010';
const out = process.argv[3] || 'docs/verification/file-browser-navigation/browser';

mkdirSync(out, { recursive: true });

const checks = [], visual = [], timings = [], network = [];
const browser = await Browser.launch();
let page;
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
};

async function wait(fn, arg) {
  for (let n = 0; n < 240; n++) {
    if (await page.eval(fn, arg)) return;

    await new Promise(done => setTimeout(done, 30));
  }

  throw Error(`Timeout: ${fn}`);
}

async function click(label) {
  const rect = await page.eval(label => {
    const el = [...document.querySelectorAll('button,input[type="checkbox"]')].find(el =>
      (el.textContent.trim() === label || el.getAttribute('aria-label') === label
        || el.closest('label')?.textContent.trim() === label)
      && el.getClientRects().length
      && !el.disabled);

    if (!el) throw Error(`Missing control: ${label}`);

    el.scrollIntoView({ block: 'nearest' });

    const r = el.getBoundingClientRect();

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);

  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...rect, button: 'left', clickCount: 1 });
}

async function key(key, code, windowsVirtualKeyCode) {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode });
}

const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const preview = () => wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
const list = () => wait(() => !document.querySelector('[data-preview-phase]'));

async function traverse(direction) {
  const history = await page.send('Page.getNavigationHistory');
  const target = history.entries[history.currentIndex + direction];

  assert.ok(target, 'browser traversal target exists');
  await page.send('Page.navigateToHistoryEntry', { entryId: target.id });
}

async function query(value) {
  await page.eval(value => {
    const input = document.querySelector('[role="search"] input');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function capture(label, width) {
  await page.setViewport({ width, height: width < 500 ? 852 : 1000 });
  await page.eval(async () => {
    scrollTo(0, 0);
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running').map(a => a.finished));
  });

  const geometry = await page.eval(() => ({
    first: document.querySelector('[aria-label="파일과 하위 폴더"] > li')?.getBoundingClientRect().top,
    visibleRows: [...document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li')].filter(el => el.getBoundingClientRect().bottom <= innerHeight).length,
    height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
    mainLeft: document.querySelector('main').getBoundingClientRect().left,
    listLeft: document.querySelector('[data-listing-phase]').getBoundingClientRect().left,
  }));

  check(
    `${label}/${width} file-first geometry`,
    !geometry.overflow && geometry.first < geometry.height * .6
    && (width < 500 ? geometry.visibleRows >= 3 : geometry.mainLeft === geometry.listLeft),
    geometry
  );

  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && !['no-title', 'small-title'].includes(f.id));

  findings.push(...judgeApp(await page.eval(app), measured, { width }));
  visual.push({ label, width, geometry, findings });
  await page.screenshot({ path: `${out}/${label}-${width}.png`, format: 'png', fullPage: true });
}

function slowPreview() {
  const original = FileSystemFileHandle.prototype.getFile;

  window.navigationProbe = { hold: false, gates: [] };
  FileSystemFileHandle.prototype.getFile = async function () {
    if (!listingProbe.preparing && navigationProbe.hold) await new Promise(done => navigationProbe.gates.push(done));

    return original.call(this);
  };
}

try {
  page = await browser.newPage({ width: 393, height: 852 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();(${slowPreview.toString()})();` }
  );
  await page.send('Network.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', e => network.push(e.request.url));
  await page.goto(base + '/files', { settleMs: 250 });
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await ready();
  check(
    'VIEW-001 tools hidden initially and filenames immediately visible',
    await page.eval(() => !document.querySelector('[role="search"]')
      && ![...document.querySelectorAll('input[type="checkbox"]')].some(el => el.getClientRects().length)
      && document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li').length === 8)
  );

  for (const width of [393, 390, 768, 1440, 1920]) await capture('files-first', width);

  await page.setViewport({ width: 393, height: 852 });
  await click('검색');
  check(
    'VIEW-003 search click exposes input with focus and labelled scope',
    await page.eval(() => document.activeElement === document.querySelector('[role="search"] input') && document.activeElement.labels.length === 1)
  );
  await query('읽기');
  await click('선택');
  await click('읽기 안내.md 선택');

  const originalHistory = await page.send('Page.getNavigationHistory');

  await click('읽기 안내.md 미리보기');
  await preview();

  const openedHistory = await page.send('Page.getNavigationHistory');

  check(
    'NAV-001 preview creates one genuine browser entry',
    openedHistory.entries.length === originalHistory.entries.length + 1
  );

  const historyShape = await page.eval(() => ({
    url: location.href,
    keys: Object.keys(history.state ?? {}),
    marker: history.state?.moaFileVisit,
    next: history.state?.__NA,
    leakedName: JSON.stringify(history.state).includes('읽기 안내')
  }));

  check(
    'NAV-003 URL and history contain opaque ID only with Next fields intact',
    historyShape.url === base + '/files' && typeof historyShape.marker === 'string' && historyShape.next === true
    && !historyShape.leakedName,
    historyShape
  );
  await traverse(-1);
  await list();
  await wait(() => document.activeElement.getAttribute('aria-label') === '읽기 안내.md 미리보기');
  check(
    'NAV-002 back restores query, selection and focus',
    await page.eval(() => document.querySelector('[role="search"] input').value === '읽기'
      && document.querySelector('[aria-label="읽기 안내.md 선택"]').checked)
  );
  await traverse(1);
  await preview();
  check(
    'NAV-001 forward reopens same document',
    await page.eval(() => document.querySelector('[data-preview-phase] h2').textContent === '읽기 안내.md')
  );
  await click('목록으로 돌아가기');
  await list();
  await traverse(1);
  await preview();
  check('NAV-001 in-app return uses same back history; forward remains available', true);

  const start = performance.now();

  for (let n = 0; n < 10; n++) {
    await traverse(-1);
    await list();
    await traverse(1);
    await preview();
  }

  timings.push({
    name: 'ten-preview-back-forward',
    ms: performance.now() - start,
    boundary: 'CDP history + OPFS reads + React; not field INP'
  });
  await traverse(-1);
  await list();
  await click('선택 취소');
  check(
    'VIEW-001 explicit cancellation clears selection and hides checkboxes',
    await page.eval(() => !document.querySelector('[data-selected="true"]')
      && ![...document.querySelectorAll('input[type="checkbox"]')].some(el => el.getClientRects().length))
  );
  await click('검색 닫기');
  check(
    'VIEW-001 closing search clears filtering and hides explanations',
    await page.eval(() => !document.querySelector('[role="search"]') && document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li').length === 8)
  );
  await click('하위 자료 폴더 열기');
  await ready();
  await traverse(-1);
  await ready();
  await wait(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 A');
  check(
    'NAV-001 folder back preserves explicit selection cancellation',
    await page.eval(() => !document.querySelector('[data-selected="true"]'))
  );
  await traverse(1);
  await ready();
  await wait(() => document.querySelector('[data-listing-phase] h2').textContent === '하위 자료');
  await click('하위 문서.txt 미리보기');
  await preview();
  await traverse(-1);
  await list();
  await traverse(-1);
  await ready();
  await wait(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 A');
  check('NAV-001 nested folder and preview use ordered history', true);
  await page.eval(() => {
    navigationProbe.hold = true;
  });
  await click('읽기 안내.md 미리보기');
  await wait(() => navigationProbe.gates.length > 0);
  await traverse(-1);
  await list();
  await page.eval(() => {
    navigationProbe.hold = false;
    navigationProbe.gates.splice(0).forEach(done => done());
  });
  await new Promise(done => setTimeout(done, 100));
  check(
    'NAV-002 late preview response cannot reopen after back',
    await page.eval(() => !document.querySelector('[data-preview-phase]'))
  );
  await click('검색');
  await page.send('Input.imeSetComposition', { text: '회의', selectionStart: 2, selectionEnd: 2 });
  check(
    'VIEW-003 IME composition keeps full list',
    await page.eval(() => document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li').length === 8)
  );
  await page.send('Input.insertText', { text: '회의' });
  await wait(() => document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li').length === 1);
  await key('Escape', 'Escape', 27);
  check(
    'VIEW-003 first Escape clears query, second closes and returns focus',
    await page.eval(() => document.activeElement.value === '')
  );
  await key('Escape', 'Escape', 27);
  await wait(() => document.activeElement.textContent === '검색');
  await click('읽기 안내.md 미리보기');
  await preview();
  await page.eval(() => [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/settings' && a.getClientRects().length).click());
  await wait(() => location.pathname === '/settings');
  await traverse(-1);
  await preview();
  check(
    'NAV-004 settings route back restores live file visit',
    await page.eval(() => location.pathname === '/files' && document.querySelector('[data-preview-phase] h2').textContent === '읽기 안내.md')
  );
  await traverse(-1);
  await list();

  const oldReads = await page.eval(() => listingProbe.productBodyReads);

  await click('폴더 연결 관리');
  await page.eval(() => {
    listingProbe.name = '검증 자료 B';
  });
  await click('다른 폴더 선택');
  await ready();
  await wait(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 B');
  await traverse(1);
  await new Promise(done => setTimeout(done, 150));
  check(
    'NAV-003 old connection history cannot resurrect file or body reads',
    await page.eval(
      reads => !document.querySelector('[data-preview-phase]') && listingProbe.productBodyReads === reads
        && document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 B',
      oldReads
    )
  );

  const sentinel = await page.eval(async () => ({
    before: listingProbe.before,
    after: await listingProbe.sentinel(),
    writes: listingProbe.productWrites
  }));

  check(
    'source unchanged and zero product writes',
    JSON.stringify(sentinel.before) === JSON.stringify(sentinel.after) && sentinel.writes === 0,
    sentinel
  );
  check(
    'no external requests or console errors',
    network.every(url => url.startsWith(base) || url.startsWith('data:')) && page.consoleErrors.length === 0,
    page.consoleErrors
  );
} finally {
  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        timings,
        visual,
        errors: page?.consoleErrors,
        boundary: 'Actual Chromium browser history traversal, real UI/stores/session/OPFS; synthetic picker/permission/CDP IME. Physical mouse driver and OS IME not verified.'
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(
    { checks: checks.length, failures: checks.filter(c => !c.passed), visual, timings },
    null,
    2
  ));
  await browser.close();
}
