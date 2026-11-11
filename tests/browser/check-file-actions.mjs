import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/file-actions-ux/browser';

mkdirSync(out, { recursive: true });

const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
const checks = [];
let page;
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
};

async function wait(fn) {
  for (let n = 0; n < 350; n++) {
    if (await page.eval(fn)) return;

    await new Promise(r => setTimeout(r, 30));
  }

  throw Error(`Timeout ${fn}: ${await page.eval(() => document.body.innerText)}`);
}

async function click(label) {
  if (await revealSelectionControl(page, label)) return;

  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const e = [...root.querySelectorAll('button,summary,input[type=checkbox]')].find(e => !e.disabled && e.getClientRects().length
      &&
      (e.textContent.trim() === label || e.getAttribute('aria-label') === label
        || e.closest('label')?.textContent.trim() === label));

    if (!e) throw Error(`Missing ${label}`);

    e.scrollIntoView({ block: 'center' });

    const r = e.getBoundingClientRect();

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);

  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}

const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');

async function key(key, code, windowsVirtualKeyCode) {
  for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode });
}

async function wheel(point, deltaY) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY });
  await new Promise(r => setTimeout(r, 80));
}

async function capture(name, width) {
  await page.setViewport({ width, height: 900 });
  await page.eval(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  check(`${name} contained at ${width}`, await page.eval(() => {
    const d = document.querySelector('dialog:modal');

    return document.documentElement.scrollWidth <= innerWidth && d.scrollWidth <= d.clientWidth
      && !d.querySelector('button button,button input,p div');
  }));
  await page.screenshot({ path: `${out}/${name}-${width}.png`, format: 'png' });
}

try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(`${base}/files`, { settleMs: 250 });
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await ready();
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      for (let i = 0; i < 40; i++) await listingProbe.a.getDirectoryHandle(`휠 검증 ${String(i).padStart(2, '0')}`, { create: true });

      await (await listingProbe.a.getDirectoryHandle('빈 폴더')).getDirectoryHandle('단일 하위 폴더', { create: true });
    }
    finally {
      listingProbe.preparing = false;
    }
  });
  await click('새로고침');
  await ready();
  check(
    'no selection hides selection controls',
    await page.eval(() => !document.querySelector('[aria-label="파일 선택"]').checkVisibility())
  );
  await click('읽기 안내.md 선택');
  await click('할 일.txt 선택');
  check(
    'generic plan entry removed',
    await page.eval(() => ![...document.querySelectorAll('button')].some(e => e.textContent === '변경 계획 검토'))
  );

  const beforeOpen = await page.eval(() => ({
    scans: listingProbe.scans,
    writes: listingProbe.productWrites,
    requests: listingProbe.permissionRequests,
    overflow: document.documentElement.style.overflow
  }));

  await click('복사');
  check('direct copy selects copy without file I/O or permission request', await page.eval(before => {
    const d = document.querySelector('dialog:modal');

    return d.querySelector('h2').textContent === '파일 복사' && d.querySelector('select').value === 'copy'
      && listingProbe.scans === before.scans
      && listingProbe.productWrites === before.writes
      && listingProbe.permissionRequests === before.requests;
  }, beforeOpen));
  check(
    'manual classification absent',
    await page.eval(() => [...document.querySelectorAll('[data-plan-phase] select option')].map(e => e.value).join(',') === 'copy,move')
  );
  check(
    'destination must be confirmed before plan',
    await page.eval(() => [...document.querySelectorAll('dialog:modal button')].find(b => b.textContent === '계획 만들기').disabled
      && document.querySelector('[aria-label="목적지 선택"]').textContent.includes('먼저 선택'))
  );
  await click('목적지 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  check(
    'direct path entry shares the folder picker',
    await page.eval(() => !!document.querySelector('[data-destination-phase] [aria-label="목적지 경로 직접 입력"] input')
      && ![...document.querySelectorAll('button')].some(b => b.textContent === '폴더에서 선택'))
  );
  check('destination selection uses compact button beside folder information', await page.eval(() => {
    const b = document.querySelector('[aria-label="검증 자료 A 폴더를 목적지로 선택"]'), r = b.getBoundingClientRect();

    return b.textContent.trim() === '이 폴더 선택' && r.height >= 44 && r.height < 65 && r.width < b.parentElement.clientWidth * .7;
  }));

  for (const width of [1440, 1920, 768, 390]) {
    await capture('destination', width);

    for (const location of ['heading', 'creation', 'list', 'backdrop']) {
      const before = await page.eval(location => {
        const d = document.querySelector('dialog:modal'), list = d.querySelector('[aria-label="목적지 하위 폴더"]');

        list.scrollTop = 0;

        const e = location === 'heading'
          ? d.querySelector('[data-destination-phase] h3')
          : location === 'creation' ? d.querySelector('[data-destination-phase] summary') : list;

        if (location !== 'backdrop') e.scrollIntoView({ block: 'center' });

        const r = e.getBoundingClientRect();

        return {
          x: location === 'backdrop' ? 3 : Math.max(20, Math.min(innerWidth - 20, r.x + r.width / 2)),
          y: location === 'backdrop' ? 3 : Math.max(20, Math.min(innerHeight - 20, r.y + r.height / 2)),
          windowY: scrollY,
          background: [...document.querySelectorAll('[data-listing-phase],main')].map(e => e.scrollTop)
        };
      }, location);

      await wheel({ x: before.x, y: before.y }, 140);

      const after = await page.eval(() => ({
        top: document.querySelector('[aria-label="목적지 하위 폴더"]').scrollTop,
        windowY: scrollY,
        background: [...document.querySelectorAll('[data-listing-phase],main')].map(e => e.scrollTop)
      }));

      check(
        `wheel over ${location} scrolls folders only at ${width}`,
        after.top > 0 && after.windowY === before.windowY
        && JSON.stringify(after.background) === JSON.stringify(before.background),
        { before, after }
      );
    }

    for (const edge of ['top', 'bottom']) {
      const before = await page.eval(edge => {
        const l = document.querySelector('[aria-label="목적지 하위 폴더"]');

        l.scrollTop = edge === 'top' ? 0 : l.scrollHeight;

        return scrollY;
      }, edge);

      await wheel({ x: 3, y: 3 }, edge === 'top' ? -600 : 600);
      check(
        `folder ${edge} edge never chains to page at ${width}`,
        await page.eval(() => scrollY) === before
      );
    }
  }

  await click('빈 폴더 목적지 폴더 열기');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  await page.setViewport({ width: 390, height: 500 });
  await page.eval(() => {
    document.querySelector('dialog:modal').scrollTop = 0;
  });

  const shortBefore = await page.eval(() => ({
    windowY: scrollY,
    listHeight: document.querySelector('[aria-label="목적지 하위 폴더"]').scrollHeight,
    listClient: document.querySelector('[aria-label="목적지 하위 폴더"]').clientHeight
  }));

  await wheel({ x: 3, y: 3 }, 200);
  check(
    'short folder list allows modal wheel scrolling at 390x500',
    await page.eval(
      before => document.querySelector('dialog:modal').scrollTop > 0 && scrollY === before.windowY
        && before.listHeight <= before.listClient,
      shortBefore
    ),
    shortBefore
  );
  await page.setViewport({ width: 390, height: 900 });
  await click('빈 폴더 폴더를 목적지로 선택');
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
  check('expected result has file-specific source and destination regions', await page.eval(() => {
    const rows = [...document.querySelectorAll('[aria-label="변경 계획 결과"] > ol > li')];

    return rows.length === 2
      && rows.every(e => e.querySelectorAll('dl > div').length === 2 && e.textContent.includes('원본 유지') && e.textContent.includes('빈 폴더')
        && e.querySelectorAll('svg').length >= 3);
  }));

  for (const width of [390, 768, 1440, 1920]) await capture('expected-tree', width);

  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click('복사 전 검사');
  await wait(() => document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === 'loading');
  check('inspection explains three actual checks and hides destination', await page.eval(() => {
    const list = document.querySelector('[aria-label="검사 항목"]');

    return ['파일 내용', '변경 여부', '이름 충돌'].every(t => list.textContent.includes(t)) && !document.querySelector('[aria-label="목적지 지정"]');
  }));
  check(
    'pending inspection never fabricates passed stages',
    await page.eval(() => !document.querySelector('[aria-label="검사 항목"] [data-checked=true]')
      && getComputedStyle(document.querySelector('[aria-label="검사 항목"] circle')).animationName !== 'none')
  );
  await page.send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }
  );
  check(
    'reduced motion stops inspection animation',
    await page.eval(() => getComputedStyle(document.querySelector('[aria-label="검사 항목"] circle')).animationName === 'none')
  );
  await page.send('Emulation.setEmulatedMedia', { features: [] });
  await capture('checking', 390);
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(r => r());
  });
  await wait(() => document.querySelector('[data-copy-inspection]')?.dataset.copyInspection === 'ready');
  check(
    'completed checks and files agree with actual report',
    await page.eval(() => document.querySelectorAll('[aria-label="검사 항목"] [data-checked=true]').length === 3
      && document.querySelectorAll('[aria-label="검사한 파일"] li').length === 2)
  );
  check('hashes hidden by default behind explained technical information', await page.eval(() => {
    const d = document.querySelector('[data-copy-inspection] details');

    return !d.open && d.querySelector('summary').textContent === '기술 정보' && d.textContent.includes('내용이 바뀌었는지')
      && !d.querySelector('code').checkVisibility();
  }));

  for (const width of [390, 768, 1440, 1920]) await capture('inspected-plan', width);

  await click('기술 정보');
  check(
    'technical comparison values remain available',
    await page.eval(() => [...document.querySelectorAll('[data-copy-inspection] code')].every(e => /^[a-f0-9]{64}$/.test(e.textContent) && e.getClientRects().length))
  );
  await click('기술 정보');

  for (let n = 0; n < 10; n++) {
    await key('Tab', 'Tab', 9);
    check(
      `keyboard focus remains inside modal ${n}`,
      await page.eval(() => document.querySelector('dialog:modal').contains(document.activeElement))
    );
  }

  await page.eval(() => Object.defineProperty(
    navigator,
    'userActivation',
    { configurable: true, value: { isActive: false } }
  ));
  await click('이 계획대로 복사');
  await wait(() => document.querySelector('dialog:modal')?.textContent.includes('복사를 시작하지 못했어요'));
  check(
    'rejected copy entry offers explicit plan recheck without writes',
    await page.eval(() => listingProbe.productWrites === 0
      && [...document.querySelectorAll('dialog:modal button')].some(b => b.textContent === '계획·검사 다시 확인'))
  );
  await click('계획·검사 다시 확인');
  check(
    'recheck returns to destination and discards execution and approval',
    await page.eval(() => document.querySelector('dialog:modal').dataset.workStep === '1' && !document.querySelector('[data-copy-execution]')
      && !document.querySelector('[data-copy-inspection]')
      && document.activeElement.tagName === 'H2')
  );
  await page.eval(() => {
    delete navigator.userActivation;
  });
  await key('Escape', 'Escape', 27);
  check(
    'close restores scroll styles and action focus',
    await page.eval(
      before => !document.querySelector('dialog:modal') && document.activeElement.textContent.trim() === '복사'
        && document.documentElement.style.overflow === before.overflow,
      beforeOpen
    )
  );
  await click('이동');
  check(
    'direct move enters the managed destination review without classification or automatic execution',
    await page.eval(() => document.querySelector('dialog:modal h2').textContent === '파일·폴더 이동'
      && !!document.querySelector('[data-managed-dialog-phase]')
      && !document.querySelector('option[value=classify]'))
  );
  await click('파일 작업 닫기');
  await click('하위 자료 폴더 열기');
  await ready();

  const openedLabel = await page.eval(() => {
    const b = document.querySelector('[aria-label="상위 폴더에서 확인한 항목"] [aria-current]');

    b.setAttribute('aria-label', '열린 폴더로 돌아가기 검증');

    return b.getAttribute('aria-label');
  });

  await click(openedLabel);
  await ready();
  check(
    'clicking opened folder returns to previous parent list',
    await page.eval(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 A')
  );
  check(
    'source and write boundaries preserved',
    await page.eval(async () => listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0
      && JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify({ at: new Date().toISOString(), checks, errors: page?.consoleErrors }, null, 2)
  );
  await browser.close();
}

console.log(`${checks.length} file action checks passed`);
