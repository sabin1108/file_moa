import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl, revealSearch, settleHistoryReturn } from '../fixtures/reveal-file-tools.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3010';
const out = process.argv[3] || 'docs/verification/file-name-search/browser';

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

  await settleHistoryReturn(page, label);
}

async function key(key, code, windowsVirtualKeyCode) {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode });
}

const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const count = () => page.eval(() => document.querySelector('[aria-label="파일 선택"] [role="status"]')?.textContent);
const names = () => page.eval(() => [...document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li')].map(el => el.innerText));

async function query(value) {
  await revealSearch(page);
  await page.eval(value => {
    const input = document.querySelector('[role="search"] input');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function navigate(path) {
  await page.eval(
    path => [...document.querySelectorAll('a')].find(el => el.getAttribute('href') === path && el.getClientRects().length).click(),
    path
  );
  await wait(path => location.pathname === path, path);
}

async function capture(label, width) {
  await page.setViewport({ width, height: 1000 });
  await page.eval(async () => {
    scrollTo(0, 0);
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running').map(a => a.finished));
  });
  check(
    `${label}/${width}: no horizontal overflow or invalid nesting`,
    await page.eval(() => document.documentElement.scrollWidth <= innerWidth
      && !document.querySelector('button button,button input,button a,a button,p div'))
  );

  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && !['no-title', 'small-title'].includes(f.id));

  findings.push(...judgeApp(await page.eval(app), measured, { width }));
  visual.push({ label, width, findings });
  await page.screenshot({ path: `${out}/${label}-${width}.png`, format: 'png', fullPage: true });
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.send('Network.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', e => network.push(e.request.url));
  await page.goto(base + '/files', { settleMs: 250 });
  check(
    'SEARCH-003 no fake search before listing is available',
    await page.eval(() => !document.querySelector('[role="search"]'))
  );
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await ready();
  await click('검색');
  check('SEARCH-001 labelled search with scoped hint', await page.eval(() => {
    const input = document.querySelector('[role="search"] input');

    return input.labels[0].textContent.includes('현재 폴더')
      && document.getElementById(input.getAttribute('aria-describedby')).textContent.includes('본문 제외');
  }));

  const ioBefore = await page.eval(() => ({
    scans: listingProbe.scans,
    requests: listingProbe.permissionRequests,
    reads: listingProbe.productBodyReads,
    writes: listingProbe.productWrites
  }));

  await click('지원하지 않는 사진.pdf 선택');
  await query('회의');
  check(
    'SEARCH-001 only matching filename is rendered',
    (await names()).length === 1 && (await names())[0].includes('회의 메모.md')
  );
  await click('표시된 파일 전체 선택');
  check('SEARCH-004 visible select-all preserves hidden file', await count() === '2개 선택 · 검색 밖 1개 포함');
  check(
    'SEARCH-004 checkbox counts visible selection, not total',
    await page.eval(() => {
      const all = document.querySelector('[aria-label="파일 선택"] input');

      return all.checked && !all.indeterminate;
    })
  );

  for (const width of [1440, 1920, 768, 390]) await capture('filtered-selection', width);

  await click('표시된 파일 전체 선택');
  check(
    'SEARCH-004 deselect-all removes only visible selection',
    await count() === '1개 선택 · 검색 밖 1개 포함'
  );
  await query('없는 검색어');
  check(
    'SEARCH-003 no-match is not a claimed empty folder',
    await page.eval(() => document.body.innerText.includes('일치하는 이름이 없어요') && !document.body.innerText.includes('이 폴더에는 파일이나 하위 폴더가 없어요'))
  );
  check(
    'SEARCH-004 zero-match all checkbox is disabled but hidden selection remains reviewable',
    await page.eval(() => document.querySelector('[aria-label="파일 선택"] input').disabled
      && ![...document.querySelectorAll('button')].find(b => b.textContent === '변경 계획 검토').disabled)
  );
  await capture('no-match', 390);

  const ioAfter = await page.eval(() => ({
    scans: listingProbe.scans,
    requests: listingProbe.permissionRequests,
    reads: listingProbe.productBodyReads,
    writes: listingProbe.productWrites
  }));

  check(
    'SEARCH-003 search/selection adds zero enumeration, body reads, writes or permission requests',
    JSON.stringify(ioBefore) === JSON.stringify(ioAfter),
    { ioBefore, ioAfter }
  );
  await click('변경 계획 검토');
  check(
    'SEARCH-006 plan receives hidden selected file',
    await page.eval(() => document.querySelector('[data-plan-phase]').innerText.includes('선택 1개'))
  );
  await page.eval(() => {
    const input = document.querySelector('[data-plan-phase] input');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '빈 폴더');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]').dataset.planPhase === 'ready');
  check(
    'SEARCH-006 hidden selection yields correct real plan row',
    await page.eval(() => document.querySelector('[aria-label="변경 계획 결과"]').innerText.includes('빈 폴더 / 지원하지 않는 사진.pdf'))
  );
  await click('계획 닫기');
  await click('선택 해제');
  await click('검색 지우기');
  check(
    'SEARCH-005 clear preserves input focus',
    await page.eval(() => document.activeElement === document.querySelector('[role="search"] input'))
  );
  await query('읽기');
  await click('읽기 안내.md 선택');
  await click('읽기 안내.md 미리보기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  await click('목록으로 돌아가기');
  check(
    'SEARCH-006 preview return preserves query, selection and filename focus',
    await count() === '1개 선택'
    && await page.eval(() => document.querySelector('[role="search"] input').value === '읽기'
      && document.activeElement.getAttribute('aria-label') === '읽기 안내.md 미리보기')
  );

  for (let n = 0; n < 10; n++) {
    await navigate('/settings');
    await navigate('/files');
    await ready();
  }

  check(
    'SEARCH-002 ten route roundtrips preserve query and selection',
    await count() === '1개 선택' && await page.eval(() => document.querySelector('[role="search"] input').value === '읽기')
  );
  await page.eval(() => document.querySelector('[role="search"] input').focus());
  await key('Escape', 'Escape', 27);
  check(
    'SEARCH-005 Escape clears only search',
    await count() === '1개 선택' && (await names()).length === 8 && await page.eval(() => document.activeElement.value === '')
  );
  await page.send('Input.imeSetComposition', { text: '회의', selectionStart: 2, selectionEnd: 2 });
  check(
    'SEARCH-005 composition edits draft without filtering',
    await page.eval(() => document.querySelector('[role="search"] input').value === '회의') && (await names()).length === 8
  );
  await key('Enter', 'Enter', 13);
  check(
    'SEARCH-005 composition Enter does not open a preview or plan',
    await page.eval(() => !document.querySelector('[data-preview-phase]') && !document.querySelector('[data-plan-phase]').open)
  );
  await page.send('Input.insertText', { text: '회의' });
  await wait(() => document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li').length === 1);
  check(
    'SEARCH-005 composition commit filters once text is confirmed',
    (await names())[0].includes('회의 메모.md')
  );
  await query('하위');
  await click('하위 자료 폴더 열기');
  await ready();
  check(
    'SEARCH-002 folder navigation resets query and selection',
    await count() === '0개 선택' && await page.eval(() => !document.querySelector('[role="search"] input'))
  );
  await query('.TXT');
  await click('새로고침');
  await ready();
  check(
    'SEARCH-001/002 refresh preserves case-insensitive search',
    (await names()).length === 1 && await page.eval(() => document.querySelector('[role="search"] input').value === '.TXT')
  );
  await click('상위 폴더');
  await ready();
  await click('빈 폴더 폴더 열기');
  await ready();
  check(
    'SEARCH-003 real empty directory remains distinguished',
    await page.eval(() => document.body.innerText.includes('이 폴더에는 파일이나 하위 폴더가 없어요'))
  );
  await click('상위 폴더');
  await ready();
  // Cross-layer regression reuses the unit-test Unicode/literal category; not an independent holdout. No user data.
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      await listingProbe.a.getFileHandle('é[1].MD', { create: true });
    }
    finally {
      listingProbe.preparing = false;
    }
  });
  await click('새로고침');
  await ready();
  await query('e\u0301[');
  check(
    'cross-layer regression: Unicode and bracket search is literal',
    (await names()).length === 1 && (await names())[0].includes('é[1].MD')
  );
  await query('긴 파일');
  await capture('long-name', 390);
  await click('검색 지우기');

  for (const entries of [100, 1000, 1001]) {
    await page.eval(async entries => {
      listingProbe.preparing = true;

      try {
        const folder = await listingProbe.a.getDirectoryHandle(`검색 ${entries}`, { create: true });

        for (let n = 0; n < entries; n++) await folder.getFileHandle(`파일-${String(n).padStart(4, '0')}.txt`, { create: true });
      } finally {
        listingProbe.preparing = false;
      }
    }, entries);
    await click('새로고침');
    await ready();
    await click(`검색 ${entries} 폴더 열기`);
    await ready();

    const listed = await page.eval(() => [...document.querySelectorAll('[aria-label="파일과 하위 폴더"] input')].map(input => input.getAttribute('aria-label').replace(/ 선택$/, '')));
    const target = listed[0], samples = [];
    const scansBefore = await page.eval(() => listingProbe.scans);

    for (let n = 0; n < 3; n++) {
      const start = performance.now();

      await query(target);
      await wait(() => document.querySelectorAll('[aria-label="파일과 하위 폴더"] > li').length === 1);
      samples.push(performance.now() - start);
      await click('검색 지우기');
    }

    check(
      `SEARCH-003 ${entries} dataset search does not enumerate again`,
      await page.eval(scans => listingProbe.scans === scans, scansBefore)
    );
    timing.push({
      entries,
      samplesMs: samples,
      boundary: 'CDP input dispatch + filter + React commit + polling, 390x1000, no filesystem I/O; not field INP'
    });

    if (entries === 1001) {
      const missing = Array.from({ length: entries }, (_, n) => `파일-${String(n).padStart(4, '0')}.txt`).find(name => !listed.includes(name));

      await query(missing);
      check(
        'SEARCH-003 omitted item is not found; partial scope remains explicit',
        (await names()).length === 0
        && await page.eval(() => document.body.innerText.includes('1,000개까지만') && document.body.innerText.includes('일부 표시'))
      );
      await capture('partial-no-match', 390);
    }

    await click('상위 폴더');
    await ready();
  }

  await query('회의');
  await page.eval(() => {
    listingProbe.failRead = 'NotReadableError';
  });
  await click('새로고침');
  await wait(() => document.querySelector('[data-listing-phase]').dataset.listingPhase === 'error');
  await query('읽기');
  check(
    'SEARCH-003 stale list can be filtered while selection stays disabled',
    (await names()).length === 1
    && await page.eval(() => document.body.innerText.includes('이전 확인 목록') && document.querySelector('[aria-label="읽기 안내.md 선택"]').disabled)
  );
  await capture('stale', 390);
  await click('다시 시도');
  await ready();
  await click('폴더 연결 관리');
  await page.eval(() => {
    listingProbe.name = '검증 자료 B';
  });
  await click('다른 폴더 선택');
  await ready();
  // A replacement picker first preserves the stale view while it resolves. Wait for the new connection's scoped state, not merely that old view's ready phase.
  await wait(() => !document.querySelector('[role="search"] input'));
  check(
    'SEARCH-002 replacement connection clears old query and collapses tools',
    await page.eval(() => !document.querySelector('[role="search"] input'))
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
        base,
        checks,
        timing,
        visual,
        consoleErrors: page?.consoleErrors,
        boundary: 'Real UI/store/session/IDB/Web Locks/OPFS; synthetic picker/permission and CDP composition; native OS IME/picker not verified'
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
