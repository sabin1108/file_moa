import assert from 'node:assert/strict';
import { finishSourceSetup, waitForVisibleAction } from '../fixtures/finish-source-setup.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3002';
const out = process.argv[3] || 'docs/verification/source-folder-browser';

mkdirSync(out, { recursive: true });
process.env.TASTE_SKILL_TMP = resolve('.taste-skill/listing-browser-profiles');
mkdirSync(process.env.TASTE_SKILL_TMP, { recursive: true });

const checks = [], timing = [], visual = [], network = [];
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
let page;
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
};
const wait = async (fn, arg) => {
  for (let count = 0; count < 160; count++) {
    if (await page.eval(fn, arg)) return;

    await new Promise(done => setTimeout(done, 50));
  }

  throw new Error(`Timeout: ${fn}`);
};
const click = async label => {
  await waitForVisibleAction(page, label);

  const rect = await page.eval(label => {
    const el = [...document.querySelectorAll('button, summary')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label) && el.getClientRects().length
      && !el.disabled);

    if (!el) return null;

    el.scrollIntoView({ block: 'center' });

    const r = el.getBoundingClientRect();

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);

  assert.ok(rect, `Missing control: ${label}`);
  await page.send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 }
  );
  await page.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 }
  );
};
const key = async (key, code, keyCode) => {
  await page.send(
    'Input.dispatchKeyEvent',
    {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      ...(key === 'Enter' ? { text: '\r' } : {})
    }
  );
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
};
const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const connectIdle = () => wait(() => !document.querySelector('[aria-label="자료 폴더 연결 설정"] [data-state="pending"]'));
const manage = async () => {
  if (await page.eval(() => !document.querySelector('dialog')?.open)) await click('폴더 연결 관리');
};
const navigate = async path => {
  await page.eval(
    path => [...document.querySelectorAll('a')].find(el => el.getAttribute('href') === path && el.getClientRects().length)?.click(),
    path
  );
  await wait(path => location.pathname === path, path);
};
const rows = () => page.eval(() => [...document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li')].map(el => el.textContent));
const capture = async (label, width) => {
  await page.setViewport({ width, height: 1000 });
  await page.eval(() => scrollTo(0, 0));
  check(
    `${label}/${width}: no horizontal overflow`,
    await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
  );

  if (label === 'connected') {
    const edges = await page.eval(() => {
      const list = document.querySelector('[aria-label="파일과 하위 폴더"]');
      const contents = list.parentElement.getBoundingClientRect();
      const first = list.firstElementChild.getBoundingClientRect();
      const style = getComputedStyle(list);

      return { offset: first.left - contents.left, padding: style.paddingLeft, margin: style.marginTop };
    });

    check(
      `${label}/${width}: list aligns with content without browser default indent`,
      Math.abs(edges.offset) < 1 && edges.padding === '0px' && edges.margin === '0px',
      edges
    );
  }

  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && f.id !== 'no-title' && f.id !== 'small-title');

  findings.push(...judgeApp(await page.eval(app), measured, { width }));
  visual.push({ label, width, findings });
  await page.screenshot({ path: `${out}/${label}-${width}.png`, format: 'png', fullPage: true });
};

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})()` }
  );
  await page.send('Network.enable');
  browser.on(
    page.sessionId,
    'Network.requestWillBeSent',
    event => network.push({ url: event.request.url, method: event.request.method })
  );
  await page.goto(base + '/settings', { settleMs: 250 });
  await connectIdle();
  await click('폴더 연결');
  await connectIdle();
  check(
    'source connection stays on settings for vault setup',
    await page.eval(() => location.pathname === '/settings')
  );
  await finishSourceSetup(page);
  await wait(() => location.pathname === '/files');
  await ready();
  check(
    'successful settings connection opens files without body reads',
    await page.eval(() => listingProbe.productBodyReads === 0)
  );
  check(
    'eight real direct children, unsupported extension included',
    (await rows()).length === 8 && (await rows()).some(name => name.includes('.pdf'))
  );
  check(
    'first listing once; no automatic permission request',
    await page.eval(() => listingProbe.scans === 1 && listingProbe.permissionRequests === 0)
  );
  check(
    'root name is not repeated in a redundant breadcrumb',
    await page.eval(() => !document.querySelector('[aria-label="현재 폴더 위치"]'))
  );

  for (const width of [1440, 1920, 768, 390]) await capture('connected', width);

  await page.eval(() => document.querySelector('[aria-label="하위 자료 폴더 열기"]').focus());
  await key('Enter', 'Enter', 13);
  await ready();
  check(
    'keyboard enters child and moves lost focus to heading',
    await page.eval(() => document.querySelector('[data-listing-phase] h2').textContent === '하위 자료'
      && document.activeElement === document.querySelector('[data-listing-phase] h2'))
  );
  check(
    'child only has its own document',
    (await rows()).length === 1 && (await rows())[0].includes('하위 문서.txt')
  );
  check('child breadcrumb preserves parent navigation and has no default indent', await page.eval(() => {
    const nav = document.querySelector('[aria-label="현재 폴더 위치"]');

    return nav.querySelector('button').textContent === '검증 자료 A'
      && nav.querySelector('[aria-current="location"]').textContent === '하위 자료'
      && getComputedStyle(nav.querySelector('ol')).paddingLeft === '0px';
  }));
  await capture('child', 390);

  const scans = await page.eval(() => listingProbe.scans);

  for (let run = 0; run < 10; run++) {
    await navigate('/');
    await navigate('/settings');
    await navigate('/files');
    await ready();
  }

  check(
    'ten route roundtrips preserve path without relisting',
    await page.eval(
      scans => listingProbe.scans === scans && document.querySelector('[data-listing-phase] h2').textContent === '하위 자료',
      scans
    )
  );
  await click('상위 폴더');
  await ready();
  await click('빈 폴더 폴더 열기');
  await ready();
  check(
    'empty folder only after a successful read',
    await page.eval(() => document.body.innerText.includes('이 폴더에는 파일이나 하위 폴더가 없어요.'))
  );
  await capture('empty', 390);
  await click('상위 폴더');
  await ready();

  await page.eval(() => {
    listingProbe.failRead = 'NotReadableError';
  });

  const previous = await rows();

  await click('새로고침');
  await wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'error');
  check(
    'refresh error keeps prior rows and marks stale',
    JSON.stringify(await rows()) === JSON.stringify(previous)
    && await page.eval(() => document.body.innerText.includes('이전 확인 목록'))
  );
  await capture('read-error', 390);
  await click('다시 시도');
  await ready();

  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click('새로고침');
  await wait(() => listingProbe.holds.length > 0);
  check('refresh keeps existing list DOM', (await rows()).length === 8);
  await capture('refreshing', 1440);
  await click('읽기 취소');
  check(
    'cancel immediately releases loading UI',
    await page.eval(() => document.querySelector('[data-listing-phase]').dataset.listingPhase === 'cancelled')
  );
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(done => done());
  });
  await click('다시 시도');
  await ready();

  const requests = await page.eval(() => listingProbe.permissionRequests);

  await page.eval(() => {
    listingProbe.permission = 'denied';
  });
  await click('새로고침');
  await wait(() => document.body.innerText.includes('다시 연결이 필요'));
  check(
    'permission loss retains stale data and exposes reconnect without automatic popup',
    await page.eval(
      requests => !document.querySelector('dialog').open && listingProbe.permissionRequests === requests
        && document.body.innerText.includes('이전 확인 목록')
        && document.body.innerText.includes('다시 연결이 필요'),
      requests
    )
  );
  await manage();
  await capture('permission', 390);
  await page.eval(() => {
    listingProbe.permission = 'granted';
  });
  await click('다시 연결');
  await connectIdle();
  await finishSourceSetup(page);
  await ready();
  check(
    'reconnect is read-only and user activated',
    await page.eval(() => listingProbe.requestsActive.every(Boolean))
  );

  await manage();
  await page.eval(() => {
    listingProbe.pickerMode = 'cancel';
  });
  await click('다른 폴더 선택');
  await connectIdle();
  check('picker cancellation preserves original rows', (await rows()).length === 8);
  await page.eval(() => {
    listingProbe.pickerMode = 'success';
    listingProbe.name = '검증 자료 B';
    listingProbe.failWrite = true;
  });
  await manage();
  await click('다른 폴더 선택');
  await connectIdle();
  check(
    'failed replacement save preserves A',
    (await rows()).length === 8
    && await page.eval(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 A')
  );
  await page.eval(() => {
    listingProbe.failWrite = false;
  });
  await manage();
  await click('다른 폴더 선택');
  await connectIdle();
  await ready();
  check(
    'replacement B contains no A entries',
    (await rows()).length === 0
    && await page.eval(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 B')
  );
  await manage();
  await page.eval(() => {
    listingProbe.name = '검증 자료 A';
  });
  await click('다른 폴더 선택');
  await connectIdle();
  await ready();

  // Dataset size is not a test-case count. Create only fixture metadata for bounded display timing.

  for (const count of [100, 1000, 1001]) {
    await page.eval(async count => {
      listingProbe.preparing = true;

      try {
        const directory = await listingProbe.a.getDirectoryHandle(`항목 ${count}개`, { create: true });

        for (let index = 0; index < count; index++) await directory.getFileHandle(`자료-${String(index).padStart(4, '0')}.txt`, { create: true });
      } finally {
        listingProbe.preparing = false;
      }
    }, count);
    await click('새로고침');
    await ready();

    const samples = [];

    for (let run = 0; run < 3; run++) {
      const start = performance.now();

      await click(`항목 ${count}개 폴더 열기`);
      await ready();
      samples.push(performance.now() - start);
      check(
        `${count} entries run${run + 1}: bounded rows`,
        (await rows()).length === Math.min(count, 1000)
      );

      if (count === 1001) check(
        `overflow run${run + 1}: explicit partial list`,
        await page.eval(() => document.body.innerText.includes('전체 목록이 아닙니다.'))
      );

      await click('상위 폴더');
      await ready();
    }

    timing.push({
      entries: count,
      samplesMs: samples,
      boundary: 'CDP click+enumeration+React update+poll; no OS picker wait; not field INP'
    });
  }

  const sentinel = await page.eval(async () => ({
    before: listingProbe.before,
    after: await listingProbe.sentinel(),
    writes: listingProbe.productWrites,
    reads: listingProbe.productBodyReads
  }));

  check(
    'source sentinel hash/path/mtime/size unchanged; product performs no writes/body reads',
    JSON.stringify(sentinel.before) === JSON.stringify(sentinel.after) && sentinel.writes === 0 && sentinel.reads === 0,
    sentinel
  );

  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click('새로고침');
  await wait(() => listingProbe.holds.length > 0);
  await manage();
  await page.eval(() => {
    listingProbe.failRemove = true;
  });
  await click('연결 해제');
  await connectIdle();
  check(
    'disconnect failure immediately clears prior listing',
    (await rows()).length === 0 && await page.eval(() => document.body.innerText.includes('연결 해제 다시 시도'))
  );
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(done => done());
    listingProbe.failRemove = false;
  });
  await click('연결 해제 다시 시도');
  await connectIdle();
  check('late held result cannot reappear after disconnect', (await rows()).length === 0);
  check(
    'no external requests or browser exceptions',
    network.every(entry => entry.url.startsWith(base) || entry.url.startsWith('data:')) && page.consoleErrors.length === 0,
    page.consoleErrors
  );
} finally {
  writeFileSync(
    `${out}/browser-checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        base,
        boundary: 'Real UI/controller/session/IDB/Web Locks/OPFS; synthetic OS picker, permission and failures; no personal files or real login',
        checks,
        timing,
        visual,
        consoleErrors: page?.consoleErrors
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(
    {
      checks: checks.length,
      failures: checks.filter(row => !row.passed),
      timing,
      visual: visual.map(row => ({ label: row.label, width: row.width, findings: row.findings }))
    },
    null,
    2
  ));
  await browser.close();
}
