import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/file-change-plan/browser';

mkdirSync(out, { recursive: true });

const checks = [], timing = [], visual = [], network = [];
const browser = await Browser.launch();
let page;
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
};

async function wait(fn, arg) {
  for (let n = 0; n < 200; n++) {
    if (await page.eval(fn, arg)) return;

    await new Promise(done => setTimeout(done, 30));
  }

  throw Error(`Timeout: ${fn}`);
}

async function click(label) {
  if (await revealSelectionControl(page, label)) return;

  const rect = await page.eval(label => {
    const el = [...document.querySelectorAll('button,input[type="checkbox"]')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label
      || el.closest('label')?.textContent.trim() === label)
      && el.getClientRects().length
      && !el.disabled);

    if (!el) throw Error(`Missing control: ${label}`);

    el.scrollIntoView({ block: 'center' });

    const r = el.getBoundingClientRect();

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);

  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...rect, button: 'left', clickCount: 1 });
}

async function key(key, code, windowsVirtualKeyCode) {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode });
}

const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const planReady = () => wait(() => document.querySelector('[data-plan-phase]').dataset.planPhase === 'ready');
const planText = () => page.eval(() => document.querySelector('[data-plan-phase]').innerText);

async function destination(value) {
  await choosePlanDestination(page, click, value);
}

async function draftPath(value) {
  await page.eval(value => {
    const input = document.querySelector('[aria-label="목적지 경로 직접 입력"] input');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function operation(value) {
  await page.eval(value => {
    const input = document.querySelector('[data-plan-phase] select');

    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function generate() {
  await click(await page.eval(() => document.querySelector('[aria-label="변경 계획 결과"]') ? '계획 다시 확인' : '계획 만들기'));
  await planReady();
}

async function capture(label, width) {
  await page.setViewport({ width, height: 1000 });
  await page.eval(async () => {
    scrollTo(0, 0);
    document.querySelector('[data-plan-phase]').scrollTop = 0;
    await Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => { })));
  });
  check(`${label}/${width}: no page/modal overflow or invalid nesting`, await page.eval(() => {
    const d = document.querySelector('[data-plan-phase]');

    return document.documentElement.scrollWidth <= innerWidth && d.scrollWidth <= d.clientWidth
      && !document.querySelector('button button,button input,button a,a button,p div');
  }));

  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && !['no-title', 'small-title'].includes(f.id));

  findings.push(...judgeApp(await page.eval(app), measured, { width }));
  visual.push({ label, width, findings });
  // Native modal/backdrop occupies the viewport, so capture that actual visible surface.
  await page.screenshot({ path: `${out}/${label}-${width}.png`, format: 'png', fullPage: false });
}
// Extend only the isolated test boundary: record permission modes and all source mutation entry points.

function installPlanProbe() {
  const p = window.listingProbe;

  p.modes = [];

  for (const method of ['queryPermission', 'requestPermission']) {
    const original = FileSystemHandle.prototype[method];

    FileSystemHandle.prototype[method] = function (options) {
      p.modes.push(options?.mode);

      return original.call(this, options);
    };
  }

  const getFile = FileSystemDirectoryHandle.prototype.getFileHandle;

  FileSystemDirectoryHandle.prototype.getFileHandle = function (name, options) {
    if (options?.create && !p.preparing) p.productWrites++;

    return getFile.call(this, name, options);
  };

  const remove = FileSystemDirectoryHandle.prototype.removeEntry;

  FileSystemDirectoryHandle.prototype.removeEntry = function (...args) {
    if (!p.preparing) p.productWrites++;

    return remove.apply(this, args);
  };

  if (FileSystemFileHandle.prototype.move) {
    const move = FileSystemFileHandle.prototype.move;

    FileSystemFileHandle.prototype.move = function (...args) {
      if (!p.preparing) p.productWrites++;

      return move.apply(this, args);
    };
  }
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();(${installPlanProbe.toString()})();` }
  );
  await page.send('Network.enable');
  await page.send('Performance.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', e => network.push(e.request.url));
  await page.goto(base + '/files', { settleMs: 250 });
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await ready();
  await click('선택');
  check(
    'PLAN-001 no selection disables move',
    await page.eval(() => [...document.querySelectorAll('button')].find(b => b.textContent === '이동').disabled)
  );

  for (const name of ['읽기 안내.md', '할 일.txt', '지원하지 않는 사진.pdf']) await click(`${name} 선택`);

  await click('이동');
  check('PLAN-007 named native modal with title focus', await page.eval(() => {
    const d = document.querySelector('[data-plan-phase]');

    return d.matches(':modal') && document.activeElement.tagName === 'H2'
      && document.getElementById(d.getAttribute('aria-labelledby')).textContent === '파일 이동';
  }));

  const tabStops = [];

  for (let n = 0; n < 12; n++) {
    await key('Tab', 'Tab', 9);
    tabStops.push(await page.eval(() => ({
      focused: document.hasFocus(),
      tag: document.activeElement.tagName,
      inside: document.querySelector('[data-plan-phase]').contains(document.activeElement)
    })));
  }

  check('PLAN-007 every Tab stays in modal', tabStops.every(stop => stop.inside), tabStops);
  await click('목적지 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  await draftPath('../outside');
  await click('경로 열기');
  check('PLAN-002 invalid path is explained', (await planText()).includes('상대 경로를 입력'));
  await capture('invalid', 390);
  await draftPath('빈 폴더');

  const scans = await page.eval(() => listingProbe.scans);

  await page.eval(() => document.querySelector('[aria-label="목적지 경로 직접 입력"] input').focus());
  await page.send('Input.imeSetComposition', { text: '한글', selectionStart: 2, selectionEnd: 2 });
  await key('Enter', 'Enter', 13);
  check(
    'PLAN-002 synthetic composition Enter does not submit',
    await page.eval(
      scans => listingProbe.scans === scans && document.querySelector('[data-plan-phase]').dataset.planPhase === 'draft',
      scans
    )
  );
  await page.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await click('목적지 탐색 취소');
  await destination('빈 폴더');
  await generate();
  check(
    'PLAN-003 move tree contains real destination and no conflicts',
    (await planText()).includes('대상 3개 · 확인 필요 0개')
    && await page.eval(() => !!document.querySelector('[aria-label="검증 자료 A / 빈 폴더 / 읽기 안내.md"]'))
  );

  for (const width of [1440, 1920, 768, 390]) await capture('move', width);

  await operation('copy');
  check(
    'PLAN-002 editing input discards old result immediately',
    await page.eval(() => !document.querySelector('[aria-label="변경 계획 결과"]'))
  );
  await generate();
  check('PLAN-003 copy explicitly preserves original', (await planText()).includes('원본을 유지하고'));
  await destination('');
  await generate();
  check(
    'PLAN-004 same paths and exact conflicts flagged',
    (await planText()).includes('확인 필요 3개') && (await planText()).includes('출발·도착 위치가 같음')
  );
  await capture('conflict', 390);
  check(
    'PLAN-003 manual classification removed for chatbot-only flow',
    await page.eval(() => !document.querySelector('option[value=classify]'))
  );
  await key('Escape', 'Escape', 27);
  check(
    'PLAN-007 Escape preserves selection and restores move trigger',
    await page.eval(() => !document.querySelector('[data-plan-phase]').open && document.activeElement.textContent === '이동'
      && document.querySelector('[aria-label="파일 선택"] [role="status"]').textContent === '3개 선택')
  );
  await click('이동');
  await destination('빈 폴더');
  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click('계획 만들기');
  await wait(() => listingProbe.holds.length === 1);
  await capture('loading', 390);
  await click('계획 읽기 취소');
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(done => done());
  });
  await wait(() => document.querySelector('[data-plan-phase]').dataset.planPhase === 'draft');
  check(
    'PLAN-007 cancel discards late result',
    await page.eval(() => !document.querySelector('[aria-label="변경 계획 결과"]'))
  );
  check(
    'PLAN-007 removed cancel control restores focus inside modal',
    await page.eval(() => document.querySelector('[data-plan-phase]').contains(document.activeElement))
  );
  await page.eval(() => {
    listingProbe.failRead = 'NotReadableError';
  });
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]').dataset.planPhase === 'error');
  check(
    'PLAN-008 read error retains destination',
    await page.eval(() => document.querySelector('[aria-label="목적지 선택"]').textContent.includes(' / 빈 폴더'))
  );
  await capture('read-error', 390);
  await generate();
  await page.eval(() => {
    listingProbe.permission = 'denied';
  });
  await click('계획 다시 확인');
  await wait(() => !document.querySelector('[data-plan-phase]').open);
  check(
    'PLAN-008 permission loss closes plan and updates shared connection',
    await page.eval(() => document.body.innerText.includes('다시 연결이 필요'))
  );
  await click('폴더 연결 관리');
  await page.eval(() => {
    listingProbe.permission = 'granted';
  });
  await click('다시 연결');
  await finishSourceSetup(page);
  await ready();
  // Independent holdout: existing file and directory both block selected names.
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      const base = await listingProbe.a.getDirectoryHandle('빈 폴더');

      await base.getDirectoryHandle('할 일.txt', { create: true });
      await base.getFileHandle('읽기 안내.md', { create: true });
    } finally {
      listingProbe.preparing = false;
    }
  });
  await click('이동');
  await destination('빈 폴더');
  await generate();
  check(
    'holdout: file and directory name conflicts',
    (await planText()).includes('확인 필요 2개') && (await planText()).includes('같은 이름이 이미 있음')
  );
  await click('계획 닫기');
  await click('표시된 파일 전체 선택');
  await click('이동');
  await destination('빈 폴더');
  await generate();
  await page.eval(() => {
    const row = [...document.querySelectorAll('[aria-label="변경 계획 결과"] > ol > li')].find(row => row.textContent.includes('긴 파일 이름'));

    row.scrollIntoView({ block: 'center' });
  });
  check('holdout: long filename remains contained in plan', await page.eval(() => {
    const d = document.querySelector('[data-plan-phase]');

    return d.scrollWidth <= d.clientWidth && document.querySelectorAll('[aria-label="변경 계획 결과"] > ol > li').length === 6;
  }));
  await page.screenshot({ path: `${out}/long-name-390.png`, format: 'png' });
  await click('계획 닫기');

  const heapBefore = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')?.value;

  for (let n = 0; n < 10; n++) {
    await click('이동');
    await click('계획 닫기');
  }

  const heapAfter = (await page.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize')?.value;

  timing.push({
    name: 'ten-open-close-heap',
    before: heapBefore,
    after: heapAfter,
    boundary: 'JS heap without forced GC; not proof of leak absence'
  });

  for (const count of [100, 1000]) {
    await page.eval(async count => {
      listingProbe.preparing = true;

      try {
        const folder = await listingProbe.a.getDirectoryHandle(`계획 ${count}`, { create: true });

        for (let n = 0; n < count; n++) await folder.getFileHandle(`합성-${String(n).padStart(4, '0')}.txt`, { create: true });
      } finally {
        listingProbe.preparing = false;
      }
    }, count);
    await click('새로고침');
    await ready();
    await click(`계획 ${count} 폴더 열기`);
    await ready();
    await click('표시된 파일 전체 선택');
    await click('이동');
    await destination('빈 폴더');

    const samples = [];

    for (let n = 0; n < 3; n++) {
      const start = performance.now();

      await generate();
      samples.push(performance.now() - start);
    }

    check(
      `${count} selected produces ${count} real plan rows`,
      await page.eval(
        count => document.querySelectorAll('[aria-label="변경 계획 결과"] > ol > li').length === count,
        count
      )
    );
    timing.push({
      count,
      samplesMs: samples,
      viewport: '390x1000',
      boundary: 'CDP click + source/destination enumeration + React render + polling, not field INP'
    });
    await click('계획 닫기');
    await click('상위 폴더');
    await ready();
  }

  await page.send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }
  );
  await click('읽기 안내.md 선택');
  await click('이동');
  check(
    'reduced-motion plan has no forced animation',
    await page.eval(() => getComputedStyle(document.querySelector('[data-plan-phase]')).transitionDuration === '0s')
  );

  const source = await page.eval(async () => ({
    before: listingProbe.before,
    after: await listingProbe.sentinel(),
    writes: listingProbe.productWrites,
    bodies: listingProbe.productBodyReads,
    modes: listingProbe.modes
  }));

  check(
    'PLAN-006 original unchanged, no product writes/body reads, read-only permission',
    JSON.stringify(source.before) === JSON.stringify(source.after) && source.writes === 0 && source.bodies === 0
    && source.modes.every(mode => mode === 'read'),
    source
  );
  check(
    'no external requests or browser errors',
    network.every(url => url.startsWith(base) || url.startsWith('data:')) && page.consoleErrors.length === 0,
    page.consoleErrors
  );
} finally {
  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        base,
        checks,
        timing,
        visual,
        consoleErrors: page?.consoleErrors,
        boundary: 'Real UI/store/session/IDB/Web Locks/OPFS; synthetic picker/permission and composition; no native OS IME/picker, real disk or login validation'
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(
    {
      checks: checks.length,
      failures: checks.filter(c => !c.passed),
      timing,
      findings: visual.filter(v => v.findings.length)
    },
    null,
    2
  ));
  await browser.close();
}
