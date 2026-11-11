import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';

const out = process.argv[2] || 'docs/verification/current-folder-creation/browser';

mkdirSync(out, { recursive: true });

const checks = [];
const browser = await Browser.launch();
let page;
const check = (name, value) => {
  checks.push({ name, passed: !!value });
  assert.ok(value, name);
};

async function wait(fn, arg) {
  for (let i = 0; i < 240; i++) {
    if (await page.eval(fn, arg)) return;

    await new Promise(r => setTimeout(r, 30));
  }

  throw Error(`Timeout ${fn}: ${await page.eval(() => document.body.innerText)}`);
}

async function click(label) {
  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const element = [...root.querySelectorAll('button,summary,input[type=checkbox]')].find(e => (e.textContent.trim() === label || e.getAttribute('aria-label') === label
      || e.closest('label')?.textContent.trim() === label)
      && e.getClientRects().length
      && !e.disabled);

    if (!element) throw Error(`Missing ${label}`);

    element.scrollIntoView({ block: 'center' });

    const r = element.getBoundingClientRect();

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);

  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}

async function input(selector, value) {
  await page.eval(({ selector, value }) => {
    const e = document.querySelector(selector);

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, value);
    e.dispatchEvent(new Event('input', { bubbles: true }));
  }, { selector, value });
}

const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');

async function capture(name, width) {
  await page.setViewport({ width, height: 900 });
  await page.eval(() => {
    window.scrollTo(0, 0);

    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  check(
    `${name} ${width} no overflow / valid structure`,
    await page.eval(() => document.documentElement.scrollWidth <= innerWidth && !document.querySelector('button button,button input,p div'))
  );
  await page.screenshot({ path: `${out}/${name}-${width}.png`, format: 'png' });
}

try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(`${process.argv[3] || 'http://127.0.0.1:3010'}/files`, { settleMs: 300 });
  check(
    'disconnected listing offers connection management',
    await page.eval(() => !!document.querySelector('[data-listing-phase] button[aria-label="폴더 연결 관리"]'))
  );
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await ready();
  // The connection action belongs to the current listing, including on narrow screens.

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`connection control stays inside listing at ${width}`, await page.eval(() => {
      const control = document.querySelector('button[aria-label="폴더 연결 관리"]');
      const listing = control?.closest('[data-listing-phase]');
      const r = control?.getBoundingClientRect(), area = listing?.getBoundingClientRect();

      return r && area && r.width >= 44 && r.height >= 44 && r.left >= area.left && r.right <= area.right
        && !control.closest('header')
        && document.documentElement.scrollWidth <= innerWidth;
    }));
  }

  await click('폴더 연결 관리');

  for (const type of ['keyDown', 'keyUp']) await page.send(
    'Input.dispatchKeyEvent',
    { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );

  await wait(() => !document.querySelector('dialog:modal'));
  check(
    'connection dialog restores focus to relocated control',
    await page.eval(() => document.activeElement?.getAttribute('aria-label') === '폴더 연결 관리')
  );
  await page.setViewport({ width: 1440, height: 900 });
  await page.eval(() => {
    const picker = window.showDirectoryPicker;

    listingProbe.extraPickers = 0;
    window.showDirectoryPicker = (...args) => {
      listingProbe.extraPickers++;

      return picker(...args);
    };
  });
  await click('선택');
  await click('읽기 안내.md 선택');
  check(
    'checkbox plus textual state',
    await page.eval(() => document.querySelector('[data-selected=true]').textContent.includes('선택됨'))
  );
  await capture('selection', 1440);
  await capture('selection', 390);
  await click('선택 취소');
  check(
    'cancel clears all and closes selection controls',
    await page.eval(() => !document.querySelector('[data-selected=true]')
      && !document.querySelector('[aria-label="파일 선택"]').getClientRects().length)
  );
  await page.setViewport({ width: 1440, height: 900 });
  await click('하위 자료 폴더 열기');
  await ready();
  check(
    'visited parent column displays current path in words',
    await page.eval(() => document.querySelector('[aria-label="상위 폴더에서 확인한 항목"] [aria-current]').textContent.includes('열린 폴더'))
  );
  await click('하위 문서.txt 미리보기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  check(
    'desktop preview preserves visible listing',
    await page.eval(() => !!document.querySelector('[data-listing-phase]').getClientRects().length && !document.querySelector('dialog:modal'))
  );

  for (const width of [1440, 1920, 768, 390]) await capture('preview', width);

  check(
    'mobile preview is native modal bottom sheet',
    await page.eval(() => {
      const d = document.querySelector('dialog:modal'), r = d?.getBoundingClientRect();

      return !!r && Math.abs(r.bottom - innerHeight) < 2;
    })
  );

  for (const type of ['keyDown', 'keyUp']) await page.send(
    'Input.dispatchKeyEvent',
    { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );

  await wait(() => !document.querySelector('[data-preview-phase]'));
  await click('상위 폴더');
  await ready();
  await click('선택');
  await click('읽기 안내.md 선택');
  await click('이동');
  await click('목적지 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  await click('빈 폴더 목적지 폴더 열기');
  await wait(() => document.querySelector('[aria-label="목적지 탐색 위치"]').textContent.includes('빈 폴더'));
  await click('＋ 새로 만들기');
  check(
    'no journal picker control',
    await page.eval(() => !document.querySelector('[data-destination-phase]').textContent.includes('기록 폴더 선택'))
  );
  await input('[data-destination-phase] form[aria-label="새로 만들기"] input', '새 목적지');
  await click('만들기');
  await wait(() => document.querySelector('[data-destination-phase]').textContent.includes('폴더를 준비했어요'));
  check(
    'actual OPFS folder exists',
    await page.eval(async () => {
      const p = await listingProbe.a.getDirectoryHandle('빈 폴더');

      return (await p.getDirectoryHandle('새 목적지')).kind === 'directory';
    })
  );
  check('durable journal has pending and ready for same operation', await page.eval(async () => {
    const parent = await listingProbe.a.getDirectoryHandle('빈 폴더');
    const journal = await parent.getDirectoryHandle('.moa-history');
    const records = [];

    for await (const h of journal.values()) if (h.name.startsWith('moa-folder-')) records.push(JSON.parse(await (await h.getFile()).text()));

    return records.length === 2 && records[0].id === records[1].id && records.some(r => r.status === 'pending')
      && records.some(r => r.status === 'ready');
  }));
  check('no extra native folder picker and no journal at root', await page.eval(async () => {
    if (listingProbe.extraPickers !== 0) return false;

    try {
      await listingProbe.a.getDirectoryHandle('.moa-history');

      return false;
    } catch (e) {
      return e.name === 'NotFoundError';
    }
  }));
  check(
    'write permission requested in active user gesture',
    await page.eval(() => listingProbe.requestsActive.every(Boolean))
  );
  await capture('new-folder', 390);
  await capture('new-folder', 1440);
  await input('[data-destination-phase] form[aria-label="새로 만들기"] input', '새 목적지');
  await click('만들기');
  await wait(() => document.querySelector('[data-destination-phase] [role=alert]')?.textContent.includes('같은 이름'));
  check('collision preserved folder', true);
  await input('[data-destination-phase] form[aria-label="새로 만들기"] input', '거부 검증');
  await page.eval(() => {
    listingProbe.permission = 'denied';
  });
  await click('만들기');
  await wait(() => document.querySelector('[data-destination-phase] [role=alert]')?.textContent.includes('쓰기 권한'));
  await page.eval(() => {
    listingProbe.permission = 'granted';
  });
  check(
    'permission denial did not create requested folder',
    await page.eval(async () => {
      try {
        const p = await listingProbe.a.getDirectoryHandle('빈 폴더');

        await p.getDirectoryHandle('거부 검증');

        return false;
      } catch (e) {
        return e.name === 'NotFoundError';
      }
    })
  );
  await input('[data-destination-phase] form[aria-label="새로 만들기"] input', '목적지 메모.txt');
  await click('만들기');
  await wait(() => document.querySelector('[data-destination-phase] form[aria-label="새로 만들기"] [role=status]')?.textContent.includes('빈 파일을'));
  check('destination form also honors explicit TXT with folder selected', await page.eval(async () => {
    const parent = await listingProbe.a.getDirectoryHandle('빈 폴더');

    return (await (await parent.getFileHandle('목적지 메모.txt')).getFile()).size === 0;
  }));
  await click('새 목적지 목적지 폴더 열기');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  await click('새 목적지 폴더를 목적지로 선택');
  check(
    'created folder becomes explicit destination',
    await page.eval(() => document.querySelector('[aria-label="목적지 선택"]').textContent.includes('빈 폴더/새 목적지')
      && document.querySelector('[aria-label="목적지 선택"]').dataset.confirmed === 'true')
  );
  await click('계획 만들기');
  await wait(() => document.querySelector('[data-plan-phase]').dataset.planPhase === 'ready');
  check(
    'new destination plan is valid',
    await page.eval(() => document.querySelector('[aria-label="변경 계획 결과"]').textContent.includes('새 목적지'))
  );
  check(
    'source sentinel unchanged',
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  await click('계획 닫기');
  await page.setViewport({ width: 1440, height: 900 });
  await click('＋ 새로 만들기');
  check(
    'list form uses its own current location without records connection',
    await page.eval(() => document.querySelector('[data-listing-phase] form').textContent.includes('생성 위치: 검증 자료 A')
      && !document.querySelector('[data-listing-phase] form').textContent.includes('기록 폴더 선택'))
  );

  const requestsBeforeComposition = await page.eval(() => {
    document.querySelector('[data-listing-phase] form input').focus();

    return listingProbe.requestsActive.length;
  });

  await page.send('Input.imeSetComposition', { text: '한글', selectionStart: 2, selectionEnd: 2 });

  for (const type of ['keyDown', 'keyUp']) await page.send(
    'Input.dispatchKeyEvent',
    {
      type,
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 229,
      ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {})
    }
  );

  check(
    'IME composing Enter does not submit creation',
    await page.eval(
      count => listingProbe.requestsActive.length === count && !document.querySelector('[data-listing-phase] form [role=status]'),
      requestsBeforeComposition
    )
  );
  await page.send('Input.insertText', { text: '한글' });

  for (const [kind, typed, expected] of [['txt', '새 텍스트', '새 텍스트.txt'], ['md', '새 기록.md', '새 기록.md']]) {
    await page.eval(kind => {
      const e = document.querySelector('[data-listing-phase] form select');

      e.value = kind;
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, kind);
    await input('[data-listing-phase] form input', typed);

    if (kind === 'txt') {
      await page.eval(() => document.querySelector('[data-listing-phase] form input').focus());

      for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });

      check(
        'keyboard reaches creation submit',
        await page.eval(() => document.activeElement === document.querySelector('[data-listing-phase] form button[type=submit]'))
      );

      for (const type of ['keyDown', 'keyUp']) await page.send(
        'Input.dispatchKeyEvent',
        {
          type,
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {})
        }
      );
    } else await click('만들기');

    await wait(
      expected => document.querySelector('[data-listing-phase] form [role=status]')?.textContent.includes(expected),
      expected
    );
    await ready();
    check(
      `creates empty ${kind} with correct extension`,
      await page.eval(
        async expected => (await (await listingProbe.a.getFileHandle(expected)).getFile()).size === 0,
        expected
      )
    );
  }

  await input('[data-listing-phase] form input', '새 기록.md');
  await click('만들기');
  await wait(() => document.querySelector('[data-listing-phase] form [role=alert]')?.textContent.includes('같은 이름'));
  check('duplicate filename rejected', true);

  for (const [selectedKind, typed, expectedKind] of [
    ['folder', 'aaa.txt', 'txt'], ['folder', '작성.MD', 'md'], ['txt', '종류 충돌.md', 'md'], ['md', '다른 종류.TXT', 'txt'],
  ]) {
    await page.eval(kind => {
      const e = document.querySelector('[data-listing-phase] form select');

      e.value = kind;
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, selectedKind);
    await input('[data-listing-phase] form input', typed);
    check(`preview honors explicit extension ${typed}`, await page.eval(name => {
      const text = document.querySelector('[data-listing-phase] form').textContent;

      return text.includes(`생성할 빈 파일: ${name}`) && text.includes('확장자에 맞춰 빈 파일');
    }, typed));

    if (typed === 'aaa.txt') {
      for (const width of [390, 1440]) await capture('explicit-extension', width);
    }

    await click('만들기');
    await wait(
      name => document.querySelector('[data-listing-phase] form [role=status]')?.textContent.includes(`‘${name}’ 빈 파일을`),
      typed
    );
    await ready();
    check(`actual empty file and matching journal kind for ${typed}`, await page.eval(async ({ name, kind }) => {
      const file = await (await listingProbe.a.getFileHandle(name)).getFile();
      const history = await listingProbe.a.getDirectoryHandle('.moa-history');
      const records = [];

      for await (const handle of history.values()) {
        if (handle.kind === 'file') records.push(JSON.parse(await (await handle.getFile()).text()));
      }

      const matching = records.filter(record => record.path.at(-1) === name);

      return file.size === 0 && matching.length === 2 && matching.every(record => record.kind === kind)
        && matching.some(record => record.status === 'ready');
    }, { name: typed, kind: expectedKind }));
  }

  check(
    'no OS folder picker during folder or file creation',
    await page.eval(() => listingProbe.extraPickers === 0)
  );

  for (const width of [390, 1440]) await capture('new-file', width);

  await click('＋ 새로 만들기');
  await click('새 텍스트.txt 미리보기');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
  check(
    'created TXT opens as empty document',
    await page.eval(() => document.querySelector('[aria-label="문서 본문"]').textContent.includes('내용이 없는 빈 파일'))
  );
  await click('목록으로 돌아가기');
  await wait(() => !document.querySelector('[data-preview-phase]'));
  // Preview DOM removal precedes history's rAF focus/scroll restoration. Wait for its
  // observable completion before the click helper performs its own scrollIntoView.
  await wait(() => document.activeElement?.getAttribute('aria-label') === '새 텍스트.txt 미리보기');
  // click() brings its target into view before dispatching input. Stabilize that same
  // viewport before measuring refresh, so helper scrolling is not mistaken for layout shift.
  await page.eval(() => {
    document.querySelector('[aria-label="새로고침"]').scrollIntoView({ block: 'center' });

    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  const before = await page.eval(() => document.querySelector('[aria-label="읽기 안내.md 미리보기"]').getBoundingClientRect().y);

  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click('새로고침');

  const after = await page.eval(() => document.querySelector('[aria-label="읽기 안내.md 미리보기"]').getBoundingClientRect().y);

  check(`refresh retains row position (${before} → ${after})`, Math.abs(after - before) < 1);
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(r => r());
  });
  await ready();
  check(
    'source sentinel remains unchanged after all new file cases',
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  await click('하위 자료 폴더 열기');
  await ready();
  await page.eval(() => {
    listingProbe.permission = 'denied';
  });
  await click('새로고침');
  await wait(() => document.querySelector('[data-listing-phase]')?.textContent.includes('권한이 필요'));

  for (const width of [390, 1440]) {
    await capture('permission', width);
    check(`permission actions do not cover the folder title at ${width}`, await page.eval(() => {
      const title = document.querySelector('[data-listing-phase] h2');
      const heading = title.getBoundingClientRect();
      const control = document.querySelector('[data-listing-phase] button[aria-label="폴더 연결 관리"]');
      const actions = control.parentElement.parentElement.getBoundingClientRect();
      const titleFitsOneLine = heading.height <= parseFloat(getComputedStyle(title).lineHeight) * 1.5;

      return titleFitsOneLine && (heading.right <= actions.left || heading.bottom <= actions.top || heading.top >= actions.bottom);
    }));
  }

  check('connection management stays available after read permission loss', await page.eval(() => {
    const button = document.querySelector('[data-listing-phase] button[aria-label="폴더 연결 관리"]');
    const r = button?.getBoundingClientRect();

    return r && r.left >= 0 && r.right <= innerWidth && !button.disabled;
  }));
  writeFileSync(
    `${out}/result.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        note: 'Real Chromium/OPFS/JSON files; picker and permissions are fixtures. Native OS prompts unverified.'
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ passed: checks.length }));
} catch (error) {
  writeFileSync(`${out}/failure.json`, JSON.stringify({ checks, error: String(error) }, null, 2));

  throw error;
}
finally {
  await browser.close();
}
