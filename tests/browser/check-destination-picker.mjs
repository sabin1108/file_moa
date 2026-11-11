import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3010';
const out = process.argv[3] || 'docs/verification/plan-destination-picker/browser';

mkdirSync(out, { recursive: true });

const checks = [], visual = [], contrasts = [], network = [];
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
    const root = document.querySelector('dialog[open]') ?? document;
    const el = [...root.querySelectorAll('button,input[type="checkbox"]')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label
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

async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode, modifiers });
}

const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const pickerReady = () => wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
const planReady = () => wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
const destination = () => page.eval(() => document.querySelector('[aria-label="목적지 선택"]').textContent);

async function typeDestination(value) {
  await page.eval(value => {
    const input = document.querySelector('[aria-label="목적지 경로 직접 입력"] input');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function capture(label, width) {
  await page.setViewport({ width, height: 900 });
  await page.eval(async () => {
    document.querySelector('[data-plan-phase]').scrollTop = 0;
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running').map(a => a.finished));
  });
  check(`${label}/${width} no overflow or broken ARIA targets`, await page.eval(() => {
    const d = document.querySelector('[data-plan-phase]');

    return document.documentElement.scrollWidth <= innerWidth && d.scrollWidth <= d.clientWidth
      && !document.querySelector('button button,button input,button a')
      && [...document.querySelectorAll('[aria-controls]')].every(el => document.getElementById(el.getAttribute('aria-controls')));
  }));

  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && !['no-title', 'small-title'].includes(f.id));

  findings.push(...judgeApp(await page.eval(app), measured, { width }));
  visual.push({ label, width, findings });
  await page.screenshot({ path: `${out}/${label}-${width}.png`, format: 'png', fullPage: true });
}

async function contrast(selector, label) {
  const colors = await page.eval(selector => {
    const el = document.querySelector(selector), css = getComputedStyle(el);

    return {
      text: css.color,
      bg: css.backgroundColor,
      border: css.borderLeftColor,
      icon: getComputedStyle(el.querySelector('svg')).color,
      width: css.borderLeftWidth
    };
  }, selector);
  const luminance = value => {
    const rgb = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);

    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const ratio = (a, b) => {
    const x = luminance(a), y = luminance(b);

    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  };
  const result = {
    label,
    colors,
    text: ratio(colors.text, colors.bg),
    border: ratio(colors.border, colors.bg),
    icon: ratio(colors.icon, colors.bg)
  };

  contrasts.push(result);
  check(
    `${label} meaningful text/icon/border contrast`,
    result.text >= 4.5 && result.border >= 3 && result.icon >= 3 && colors.width === '4px',
    result
  );
}

try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.send('Network.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', e => network.push(e.request.url));
  await page.goto(base + '/files', { settleMs: 250 });
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await ready();
  await click('선택');
  await click('읽기 안내.md 선택');
  await click('이동');

  const beforeHistory = await page.send('Page.getNavigationHistory');

  await click('목적지 선택');
  await pickerReady();
  check(
    'DEST-001 directory choices exclude files; title receives focus',
    await page.eval(() => document.querySelectorAll('[aria-label="목적지 하위 폴더"] li').length === 2
      && !document.querySelector('[aria-label="목적지 하위 폴더"]').textContent.includes('.md')
      && document.activeElement.textContent === '목적지 폴더 선택')
  );
  check(
    'DEST-003 plan controls hidden while browsing; direct input is local',
    await page.eval(() => !document.querySelector('[data-plan-phase] select').checkVisibility()
      && !document.querySelector('[aria-label="목적지 경로 직접 입력"] input').disabled)
  );

  const keyboard = [];

  for (const modifiers of [0, 8]) for (let n = 0; n < 12; n++) {
    await key('Tab', 'Tab', 9, modifiers);
    keyboard.push(await page.eval(() => document.querySelector('[data-plan-phase]').contains(document.activeElement)));
  }

  check(
    'DEST-003 Tab and Shift+Tab remain inside plan while picker is expanded',
    keyboard.every(Boolean)
  );

  for (const width of [390, 768, 1440, 1920]) await capture('destination', width);

  await click('하위 자료 목적지 폴더 열기');
  await pickerReady();
  check(
    'DEST-001 child location and empty-subfolder state are real',
    await page.eval(() => document.querySelector('[aria-label="목적지 탐색 위치"]').textContent === '검증 자료 A / 하위 자료'
      && document.querySelector('[data-destination-phase]').innerText.includes('하위 폴더가 없습니다'))
  );
  await click('하위 자료 폴더를 목적지로 선택');
  check(
    'DEST-002 choice updates path button and returns focus',
    (await destination()).includes(' / 하위 자료')
    && await page.eval(() => !document.querySelector('[data-destination-phase]') && document.activeElement.getAttribute('aria-label') === '목적지 선택')
  );
  await click('계획 만들기');
  await planReady();
  check(
    'DEST-002 generated tree uses chosen destination and file',
    await page.eval(() => !!document.querySelector('[aria-label="변경 계획 결과"] [aria-label="검증 자료 A / 하위 자료 / 읽기 안내.md"]'))
  );
  await click('목적지 선택');
  await pickerReady();
  check(
    'DEST-001 reopening starts at selected path',
    await page.eval(() => document.querySelector('[aria-label="목적지 탐색 위치"]').textContent.endsWith('/ 하위 자료'))
  );
  await click('상위 폴더');
  await pickerReady();
  await click('빈 폴더 목적지 폴더 열기');
  await pickerReady();
  await key('Escape', 'Escape', 27);
  await wait(() => !document.querySelector('[data-destination-phase]'));
  check(
    'DEST-003 Escape cancels only picker and keeps previous destination',
    (await destination()).includes(' / 하위 자료')
    && await page.eval(() => document.querySelector('[data-plan-phase]').open && document.activeElement.getAttribute('aria-label') === '목적지 선택')
  );
  await click('목적지 선택');
  await pickerReady();
  await click('검증 자료 A 최상위로 이동');
  await pickerReady();
  await click('검증 자료 A 폴더를 목적지로 선택');

  const rootDestination = await destination();

  check(
    'DEST-002 choosing root confirms the connected folder',
    rootDestination.includes('검증 자료 A') && !rootDestination.includes(' / ')
  );
  await click('계획 만들기');
  await planReady();
  await contrast('[aria-label="변경 계획 결과"] ol li > p', 'WARN-001 same-path conflict');
  await capture('conflict-warning', 390);
  await click('목적지 선택');
  await pickerReady();
  await typeDestination('../invalid');
  await click('경로 열기');
  check(
    'DEST-001 invalid direct path is rejected without changing committed destination',
    await destination() === rootDestination
    && await page.eval(() => document.querySelector('[aria-label="목적지 경로 직접 입력"] input').getAttribute('aria-invalid') === 'true'
      && document.querySelector('[aria-label="목적지 탐색 위치"]').textContent === '검증 자료 A')
  );
  await typeDestination('없는 폴더');
  await click('경로 열기');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'error');
  check(
    'DEST-004 missing destination cannot be selected',
    await page.eval(() => document.querySelector('[data-destination-phase] button[aria-label$="폴더를 목적지로 선택"]').disabled)
  );
  await contrast('[data-destination-phase] [data-state="error"]', 'WARN-001 read error');
  await capture('missing-folder', 390);
  await click('검증 자료 A 최상위로 이동');
  await pickerReady();
  await click('목적지 탐색 취소');
  await page.eval(() => {
    listingProbe.failRead = 'NotReadableError';
  });
  await click('목적지 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'error');
  await click('목적지 다시 시도');
  await pickerReady();
  check(
    'DEST-004 retry recovers real folder listing',
    await page.eval(() => document.querySelectorAll('[aria-label="목적지 하위 폴더"] li').length === 2)
  );
  await click('목적지 탐색 취소');
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      const folder = await listingProbe.a.getDirectoryHandle('부분 목록', { create: true });

      for (let n = 0; n < 1001; n++) await folder.getFileHandle(`파일-${n}.txt`, { create: true });
    }
    finally {
      listingProbe.preparing = false;
    }
  });
  await click('목적지 선택');
  await pickerReady();
  await typeDestination('부분 목록');
  await click('경로 열기');
  await pickerReady();
  check(
    'DEST-004 partial listing warns without claiming no children globally',
    await page.eval(() => document.querySelector('[data-destination-phase]').innerText.includes('1,000개')
      && document.querySelector('[data-destination-phase]').innerText.includes('확인한 항목 안에는'))
  );
  await contrast('[data-destination-phase] [data-state="attention"]', 'WARN-001 partial listing');
  await capture('partial-warning', 390);
  await click('목적지 탐색 취소');
  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click('목적지 선택');
  await wait(() => listingProbe.holds.length > 0);
  check(
    'DEST-004 loading destination cannot be chosen',
    await page.eval(() => document.querySelector('[data-destination-phase] button[aria-label$="폴더를 목적지로 선택"]').disabled)
  );
  await click('목적지 탐색 취소');
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(done => done());
  });
  await new Promise(done => setTimeout(done, 100));
  check(
    'DEST-005 late cancelled read cannot reopen picker or alter destination',
    await destination() === rootDestination && await page.eval(() => !document.querySelector('[data-destination-phase]'))
  );

  const afterHistory = await page.send('Page.getNavigationHistory');

  check(
    'DEST-003 picker did not alter browser history, source folder or selection',
    beforeHistory.entries.length === afterHistory.entries.length && beforeHistory.currentIndex === afterHistory.currentIndex
    && await page.eval(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 A'
      && document.querySelector('[aria-label="읽기 안내.md 선택"]').checked)
  );
  await page.eval(() => {
    listingProbe.permission = 'denied';
  });
  await click('목적지 선택');
  await wait(() => !document.querySelector('[data-plan-phase]').open);
  check(
    'DEST-005 permission loss closes entire plan and exposes reconnect status',
    await page.eval(() => !document.querySelector('[data-destination-phase]') && document.body.innerText.includes('다시 연결이 필요'))
  );

  const sentinel = await page.eval(async () => ({
    before: listingProbe.before,
    after: await listingProbe.sentinel(),
    writes: listingProbe.productWrites,
    reads: listingProbe.productBodyReads
  }));

  check(
    'source unchanged; zero product writes and body reads',
    JSON.stringify(sentinel.before) === JSON.stringify(sentinel.after) && sentinel.writes === 0 && sentinel.reads === 0,
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
        visual,
        contrasts,
        consoleErrors: page?.consoleErrors,
        boundary: 'Real UI/store/session/OPFS, synthetic picker/permissions/errors; native OS folder dialog not exercised'
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(
    {
      checks: checks.length,
      failures: checks.filter(c => !c.passed),
      contrasts,
      findings: visual.filter(v => v.findings.length)
    },
    null,
    2
  ));
  await browser.close();
}
