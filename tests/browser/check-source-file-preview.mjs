import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { settleHistoryReturn } from '../fixtures/reveal-file-tools.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3002';
const out = process.argv[3] || 'docs/verification/source-file-preview/browser';

mkdirSync(out, { recursive: true });

const checks = [], visual = [], timing = [], network = [];
const browser = await Browser.launch();
let page;
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, `${name}: ${JSON.stringify(detail)}`);
};
const wait = async (fn, arg) => {
  for (let n = 0; n < 200; n++) {
    if (await page.eval(fn, arg)) return;

    await new Promise(done => setTimeout(done, 50));
  }

  throw Error(`Timeout: ${fn}`);
};
const click = async label => {
  const point = await page.eval(label => {
    const el = [...document.querySelectorAll('button,summary')].find(el => (el.textContent.trim() === label || el.getAttribute('aria-label') === label) && el.getClientRects().length
      && !el.disabled);

    if (!el) throw Error(`Missing visible enabled control: ${label}`);

    el.scrollIntoView({ block: 'center' });

    if (label.endsWith(' 미리보기')) previewProbe.returnScroll = scrollY;

    const r = el.getBoundingClientRect();

    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);

  await page.send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }
  );
  await page.send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }
  );
  await settleHistoryReturn(page, label);
};
const previewReady = () => wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'ready');
const listReady = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
const idle = () => wait(() => !document.querySelector('[aria-label="자료 폴더 연결 설정"] [data-state="pending"]'));
const capture = async (label, width) => {
  await page.setViewport({ width, height: 1000 });
  await page.eval(() => scrollTo(0, 0));
  check(
    `${label}/${width}: no horizontal overflow`,
    await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
  );
  check(`${label}/${width}: semantic structure and disclosure targets`, await page.eval(() => {
    const invalidInteractive = document.querySelector('button button, button a[href], a[href] button, a[href] a[href], form form');
    const listsValid = [...document.querySelectorAll('ul,ol')].every(list => [...list.children].every(child => ['LI', 'SCRIPT', 'TEMPLATE'].includes(child.tagName)));
    const targetsValid = [...document.querySelectorAll('[aria-controls]')].every(el => el.getAttribute('aria-controls').split(/\s+/).every(id => document.getElementById(id)));

    return !invalidInteractive && listsValid && targetsValid && document.querySelectorAll('main').length === 1
      && !!document.querySelector('[data-preview-phase] h2');
  }));

  const measured = await page.eval(probe);
  const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })].filter(f => !APP_SKIP.has(f.id) && f.id !== 'no-title' && f.id !== 'small-title');

  findings.push(...judgeApp(await page.eval(app), measured, { width }));
  visual.push({ label, width, findings });
  await page.screenshot({ path: `${out}/${label}-${width}.png`, format: 'png', fullPage: true });
};

function installPreviewFixture() {
  const p = window.previewProbe = { buffers: 0, hold: false, gates: [], fail: '', returnScroll: 0 };
  const originalGetFile = FileSystemFileHandle.prototype.getFile;

  FileSystemFileHandle.prototype.getFile = async function () {
    if (!listingProbe.preparing) {
      if (p.hold) await new Promise(resolve => p.gates.push(resolve));

      if (p.fail) {
        const name = p.fail;

        p.fail = '';

        throw new DOMException('synthetic file failure', name);
      }
    }

    const file = await originalGetFile.call(this);

    if (!listingProbe.preparing) {
      const arrayBuffer = file.arrayBuffer.bind(file);

      file.arrayBuffer = async () => {
        p.buffers++;

        return arrayBuffer();
      };
    }

    return file;
  };
  p.write = async (name, body) => {
    listingProbe.preparing = true;

    try {
      const f = await listingProbe.a.getFileHandle(name, { create: true });
      const writer = await f.createWritable();

      await writer.write(body);
      await writer.close();
    } finally {
      listingProbe.preparing = false;
    }
  };

  const prepare = listingProbe.prepare;

  listingProbe.prepare = async () => {
    await prepare();
    p.text = '# 원문 읽기\n\n' + '파일을 읽는 동안 원본은 변경하지 않습니다. 이 문장은 화면 읽기 폭과 한글 줄바꿈을 확인하는 합성 자료입니다.\n\n'.repeat(5)
      + '<script>window.previewExecuted=true</script>\n<img src="https://invalid.example/private.png">\n![원격 이미지](https://invalid.example/image.png)\n[위험 링크](javascript:alert(1))\n  공백과 줄바꿈을 보존합니다.\n';
    await p.write('서식.md', p.text);
    await p.write('빈 문서.txt', '');
    await p.write('잘못된 UTF8.txt', new Uint8Array([0xc3, 0x28]));
    await p.write('큰 문서.txt', new Uint8Array(2097153).fill(65));
    await p.write('상한.txt', 'a'.repeat(2097152));
  };
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();(${installPreviewFixture.toString()})();` }
  );
  await page.send('Network.enable');
  browser.on(page.sessionId, 'Network.requestWillBeSent', e => network.push(e.request.url));
  await page.goto(base + '/files', { settleMs: 250 });
  await idle();
  check('connection headings do not skip a level before a folder is selected', await page.eval(() => {
    const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(el => el.getClientRects().length).map(el => Number(el.tagName[1]));

    return levels[0] === 1 && levels.every((level, i) => i === 0 || level <= levels[i - 1] + 1);
  }));
  await click('폴더 연결 관리');
  await click('폴더 연결');
  await finishSourceSetup(page);
  await listReady();
  check(
    'listing does not read file bodies',
    await page.eval(() => listingProbe.productBodyReads === 0)
  );
  check(
    'unsupported PDF is not a preview control',
    await page.eval(() => ![...document.querySelectorAll('button')].some(el => el.getAttribute('aria-label')?.includes('.pdf 미리보기')))
  );
  await page.eval(() => {
    window.originalList = document.querySelector('[aria-label="파일과 하위 폴더"]');
    document.querySelector('[aria-label="서식.md 미리보기"]').focus();
  });
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
  );
  await previewReady();
  check(
    'Enter opens actual source text and focuses heading',
    await page.eval(() => document.querySelector('[aria-label="문서 본문"]').textContent === previewProbe.text
      && document.activeElement === document.querySelector('[data-preview-phase] h2'))
  );
  check(
    'source HTML/Markdown has no executable DOM or remote resources',
    await page.eval(() => !window.previewExecuted
      && !document.querySelector('[aria-label="문서 본문"] script, [aria-label="문서 본문"] img, [aria-label="문서 본문"] a'))
  );
  check(
    'file information defaults closed; source list DOM preserved',
    await page.eval(() => document.querySelector('[aria-label="파일 정보"]').hidden
      && originalList === document.querySelector('[aria-label="파일과 하위 폴더"]')
      && originalList.getClientRects().length === 0)
  );
  await page.eval(() => {
    window.originalBody = document.querySelector('[aria-label="문서 본문"]');
  });

  for (const width of [1440, 1920, 768, 390]) await capture('document', width);

  await click('파일 정보 보기');
  check(
    'metadata toggle preserves body DOM and shows source data',
    await page.eval(() => originalBody === document.querySelector('[aria-label="문서 본문"]')
      && !document.querySelector('[aria-label="파일 정보"]').hidden
      && document.querySelector('[aria-label="파일 정보"]').textContent.includes('bytes'))
  );
  await capture('information', 390);
  await click('파일 정보 접기');

  const reads = await page.eval(() => listingProbe.productBodyReads);

  for (let run = 0; run < 10; run++) {
    for (const path of ['/settings', '/', '/files']) {
      await page.eval(
        path => [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === path && a.getClientRects().length).click(),
        path
      );
      await wait(path => location.pathname === path, path);
    }

    await previewReady();
  }

  check(
    'ten route roundtrips preserve document without rereading',
    await page.eval(
      reads => listingProbe.productBodyReads === reads
        && document.querySelector('[aria-label="문서 본문"]').textContent === previewProbe.text,
      reads
    )
  );
  await click('목록으로 돌아가기');
  check(
    'back clears body and restores visible listing',
    await page.eval(() => !document.querySelector('[data-preview-phase]')
      && document.querySelector('[aria-label="파일과 하위 폴더"]').getClientRects().length > 0)
  );
  await click('서식.md 미리보기');
  await previewReady();
  await click('목록으로 돌아가기');
  check(
    'back restores file focus and list scroll',
    await page.eval(() => document.activeElement?.getAttribute('aria-label') === '서식.md 미리보기' && Math.abs(scrollY - previewProbe.returnScroll) < 2)
  );
  await click('하위 자료 폴더 열기');
  await listReady();
  await click('하위 문서.txt 미리보기');
  await previewReady();
  await click('파일 정보 보기');
  check(
    'nested file has correct body and relative location',
    await page.eval(() => document.querySelector('[aria-label="문서 본문"]').textContent === '하위 폴더의 합성 원문'
      && document.querySelector('[aria-label="파일 정보"]').textContent.includes('검증 자료 A / 하위 자료'))
  );
  await click('목록으로 돌아가기');
  await click('상위 폴더');
  await listReady();
  await click('빈 문서.txt 미리보기');
  await previewReady();
  check(
    'zero-byte successful read shows empty-file message',
    await page.eval(() => document.body.innerText.includes('내용이 없는 빈 파일이에요.'))
  );
  await capture('empty', 390);
  await click('목록으로 돌아가기');

  for (const [name, message] of [['잘못된 UTF8.txt', 'UTF-8로 읽을 수 없는'], ['큰 문서.txt', '2MiB를 넘는']]) {
    const buffers = await page.eval(() => previewProbe.buffers);

    await click(name + ' 미리보기');
    await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'error');
    check(
      name + ': no stale text, correct error',
      await page.eval(
        message => !document.querySelector('[aria-label="문서 본문"]') && document.body.innerText.includes(message),
        message
      )
    );

    if (name === '큰 문서.txt') check(
      'oversized file rejected before arrayBuffer',
      await page.eval(buffers => previewProbe.buffers === buffers, buffers)
    );

    await capture(name === '큰 문서.txt' ? 'too-large' : 'encoding', 390);
    await click('목록으로 돌아가기');
  }

  await click('서식.md 미리보기');
  await previewReady();
  await page.eval(() => {
    previewProbe.fail = 'NotFoundError';
  });
  await click('본문 새로고침');
  await wait(() => document.querySelector('[data-preview-phase]')?.dataset.previewPhase === 'error');
  check(
    'deleted-file refresh preserves previous text with stale warning',
    await page.eval(() => document.querySelector('[aria-label="문서 본문"]').textContent === previewProbe.text
      && document.body.innerText.includes('이전에 읽은 본문'))
  );
  await capture('missing', 390);
  await click('본문 다시 시도');
  await previewReady();
  await page.eval(() => {
    previewProbe.hold = true;
  });
  await click('본문 새로고침');
  await wait(() => previewProbe.gates.length > 0);
  await capture('refreshing', 1440);
  await click('본문 읽기 취소');
  check(
    'cancel immediately leaves pending phase',
    await page.eval(() => document.querySelector('[data-preview-phase]').dataset.previewPhase === 'cancelled')
  );
  check(
    'cancel restores focus after its button disappears',
    await page.eval(() => document.activeElement === document.querySelector('[data-preview-phase] h2'))
  );
  await page.eval(() => {
    previewProbe.hold = false;
    previewProbe.gates.splice(0).forEach(done => done());
  });
  await click('본문 다시 시도');
  await previewReady();
  await page.eval(async () => {
    await previewProbe.write('서식.md', '외부 수정 뒤 새로 읽은 합성 본문');
  });
  await click('본문 새로고침');
  await previewReady();
  check(
    'refresh reacquires externally changed file',
    await page.eval(() => document.querySelector('[aria-label="문서 본문"]').textContent === '외부 수정 뒤 새로 읽은 합성 본문')
  );
  await page.eval(() => {
    listingProbe.permission = 'denied';
  });
  await click('본문 새로고침');
  await wait(() => document.body.innerText.includes('파일을 읽을 권한이 필요'));
  check(
    'permission loss exposes connection status and disables preview refresh',
    await page.eval(() => !document.querySelector('dialog').open && document.body.innerText.includes('다시 연결이 필요')
      && [...document.querySelectorAll('button')].find(b => b.textContent === '본문 새로고침').disabled)
  );
  await capture('permission', 390);
  await page.eval(() => {
    listingProbe.permission = 'granted';
  });
  await click('폴더 연결 관리');
  await click('다시 연결');
  await previewReady();
  check(
    'explicit reconnect reopens the same document',
    await page.eval(() => document.querySelector('[data-preview-phase] h2').textContent === '서식.md')
  );
  await click('목록으로 돌아가기');

  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });

    const samples = [];

    for (let n = 0; n < 3; n++) {
      const start = performance.now();

      await click('상한.txt 미리보기');
      await previewReady();
      check(
        `2MiB/${width}/run${n + 1}: entire text without overflow`,
        await page.eval(() => document.querySelector('[aria-label="문서 본문"]').textContent.length === 2097152
          && document.documentElement.scrollWidth <= innerWidth)
      );
      samples.push(performance.now() - start);
      await click('목록으로 돌아가기');
    }

    timing.push({
      bytes: 2097152,
      width,
      samplesMs: samples,
      boundary: 'CDP click + File read/decode + React commit/layout query + polling; not INP or isolated decode time'
    });
  }

  await click('서식.md 미리보기');
  await previewReady();
  await page.eval(() => {
    previewProbe.hold = true;
  });
  await click('본문 새로고침');
  await wait(() => previewProbe.gates.length > 0);
  await click('목록으로 돌아가기');
  await page.eval(() => {
    previewProbe.hold = false;
    previewProbe.gates.splice(0).forEach(done => done());
  });
  await click('빈 문서.txt 미리보기');
  await previewReady();
  check(
    'close prevents late text from replacing the next document',
    await page.eval(() => document.querySelector('[data-preview-phase] h2').textContent === '빈 문서.txt'
      && document.body.innerText.includes('내용이 없는 빈 파일'))
  );

  if (!await page.eval(() => document.querySelector('dialog').open)) await click('폴더 연결 관리');

  await page.eval(() => {
    listingProbe.failRemove = true;
  });
  await click('연결 해제');
  await idle();
  check(
    'failed disconnect still clears document and listing',
    await page.eval(() => !document.querySelector('[data-preview-phase]') && !document.querySelector('[aria-label="문서 본문"]')
      && !document.querySelector('[aria-label="파일과 하위 폴더"]'))
  );

  const sentinel = await page.eval(async () => ({
    before: listingProbe.before,
    after: await listingProbe.sentinel(),
    writes: listingProbe.productWrites
  }));

  check(
    'original sentinel unchanged and product never writes',
    JSON.stringify(sentinel.before) === JSON.stringify(sentinel.after) && sentinel.writes === 0,
    sentinel
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
        boundary: 'Real UI/session/controller/OPFS/IDB; synthetic picker/permissions/file failures; no personal data or native permission dialog',
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
      failures: checks.filter(c => !c.passed),
      timing,
      findings: visual.filter(v => v.findings.length)
    },
    null,
    2
  ));
  await browser.close();
}
