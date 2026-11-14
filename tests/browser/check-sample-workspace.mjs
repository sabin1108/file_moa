import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { probe, layout, app } from "../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs";
import { judge, judgeLayout, judgeApp, APP_SKIP } from "../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3034";
const output = process.argv[3] ?? "docs/verification/conversation-organization/files";

mkdirSync(output, { recursive: true });

const checks = [], visual = [], observations = [];
const browser = await Browser.launch({
  extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"]
});

function check(name, value, detail) {
  checks.push({ name, passed: !!value, detail });
  assert.ok(value, name);
}

async function waitFor(page, fn) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await page.eval(`Boolean((${fn.toString()})())`)) return;

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  writeFileSync(`${output}/failure-state.json`, JSON.stringify(await page.eval(() => ({
    path: location.pathname,
    phase: document.querySelector('[data-sample-phase]')?.getAttribute('data-sample-phase'),
    ready: document.querySelector('[data-sample-ready]')?.getAttribute('data-sample-ready'),
    text: document.body.innerText.slice(0, 1200),
    saved: Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.startsWith('moa.sample.v1.'))),
  })), null, 2));

  throw new Error("Sample UI did not reach expected state");
}

const click = (page, selector) => page.eval(selector => {
  const button = document.querySelector(selector);

  if (!button) throw new Error('Missing control: ' + selector);

  button.click();
}, selector);
const locationOf = (page, id) => page.eval(id => {
  const saved = Object.entries(sessionStorage).find(([key]) => key.startsWith('moa.sample.v1.'))?.[1];

  return saved ? JSON.parse(saved).locations[id] : null;
}, id);

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });

  for (const route of ['/preview', '/preview/screens/chat', '/preview/folder-connection']) {
    check(`retired ${route} returns 404`, (await fetch(base + route)).status === 404);
  }

  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    window.sampleIO = [];
    window.sampleMotion = [];
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) { window.sampleMotion.push({ duration: options?.duration, hasHeight: frames.some(frame => 'height' in frame) }); return originalAnimate.call(this, frames, options); };
    const originalOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(...args) { window.sampleIO.push('indexedDB'); return originalOpen.apply(this,args); };
    window.showDirectoryPicker = () => { window.sampleIO.push('picker'); throw new Error('Sample cannot open real folders'); };
    window.showOpenFilePicker = () => { window.sampleIO.push('filePicker'); throw new Error('Sample cannot open real files'); };
  `
  });
  await page.goto(base + "/demo/files", { settleMs: 300 });
  await waitFor(page, () => location.pathname === "/demo/intro"
    && !!document.querySelector('a[href="/demo/start?intro=done&view=files"]'));
  check(
    "fresh sample entry shows the introduction before the workspace",
    await page.eval(() => !document.querySelector('[data-workspace="sample"]'))
  );
  await click(page, 'a[href="/demo/start?intro=done&view=files"]');
  await waitFor(page, () => document.querySelector('[data-sample-ready="true"]'));
  check(
    "public entry reaches sample workspace without production login",
    await page.eval(() => location.pathname === "/demo/files" && !!document.querySelector('[data-workspace="sample"]')
      && !document.querySelector('[data-workspace="live"]'))
  );
  check(
    "sample entry preserves the browser origin",
    await page.eval(() => location.origin) === new URL(base).origin
  );
  check(
    "84 nested samples with ten root files and separate prepared/AI actions",
    await page.eval(() => document.querySelectorAll('[data-sample-id]').length === 10 && document.body.innerText.includes('84개 파일')
      && document.querySelector('[data-action="sample-propose"]').textContent.includes('준비된')
      && document.querySelector('[data-action="sample-ai"]').disabled)
  );
  await click(page, '[class*="aiConsent"] input');
  check(
    "explicit sample consent enables AI",
    await page.eval(() => !document.querySelector('[data-action="sample-ai"]').disabled)
  );
  await click(page, '[data-sample-id="text-003"] input');
  check(
    "changing the selection invalidates consent",
    await page.eval(() => document.querySelector('[data-action="sample-ai"]').disabled
      && !document.querySelector('[class*="aiConsent"] input').checked)
  );
  await click(page, '[data-sample-id="text-003"] input');
  check(
    "restoring the old selection still requires fresh consent",
    await page.eval(() => document.querySelector('[data-action="sample-ai"]').disabled)
  );
  check("no IndexedDB or file picker access", await page.eval(() => window.sampleIO.length === 0));
  await page.eval(() => localStorage.setItem("sample-live-sentinel", "preserved"));

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(
      `${width}: no horizontal overflow`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
    );

    const measured = await page.eval(probe);
    const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })]
      .filter(finding => !APP_SKIP.has(finding.id));

    findings.push(...judgeApp(await page.eval(app), measured, { width }));
    visual.push({ width, findings });
    await page.screenshot({ path: `${output}/select-${width}.png`, format: "png", fullPage: true });
  }

  await page.setViewport({ width: 1440, height: 1000 });
  await click(page, '[data-sample-id="sample-pdf"] button');
  await waitFor(page, () => [...document.querySelectorAll('[aria-label$="PDF 페이지 미리보기"] img')].length === 2
    && [...document.querySelectorAll('[aria-label$="PDF 페이지 미리보기"] img')].every(image => image.complete && image.naturalWidth > 0));
  check(
    "PDF preview loads two checked page images",
    await page.eval(() => document.querySelectorAll('[aria-label$="PDF 페이지 미리보기"] img').length === 2)
  );
  check("PDF asset is a real PDF", await page.eval(async () => {
    const response = await fetch('/demo/assets/sample-pdf');

    return response.ok && response.headers.get('content-type') === 'application/pdf' && (await response.text()).startsWith('%PDF-');
  }));
  await page.screenshot({ path: `${output}/pdf-1440.png`, format: "png", fullPage: true });
  await click(page, '[data-sample-id="sample-xlsx"] button');
  check(
    "Excel preview shows checked cells and total",
    await page.eval(() => document.querySelector('table')?.innerText.includes('10.5')
      && document.querySelector('table')?.innerText.includes('통계 중앙값과 분산'))
  );
  check("Excel download is a real XLSX archive", await page.eval(async () => {
    const response = await fetch('/demo/assets/sample-xlsx');
    const bytes = new Uint8Array(await response.arrayBuffer());

    return response.ok && response.headers.get('content-type').includes('spreadsheetml') && bytes[0] === 80 && bytes[1] === 75;
  }));
  await page.screenshot({ path: `${output}/xlsx-1440.png`, format: "png", fullPage: true });

  await page.eval(() => document.querySelector('[data-action="sample-propose"]').focus());
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
  );
  await waitFor(page, () => document.querySelector('[data-sample-phase="review"]'));
  check(
    "keyboard opens shared plan review before any sample move",
    (await locationOf(page, "text-001")) === null
    && await page.eval(() => !!document.querySelector('[aria-label="변경 계획 결과"]'))
  );
  check(
    "shared workflow transition animates height without replacing the workspace",
    await page.eval(() => window.sampleMotion.some(animation => animation.duration === 260 && animation.hasHeight))
  );
  await click(page, '[data-browse-for="text-001"]');
  await waitFor(page, () => document.querySelector('[data-destination-phase="ready"]'));
  check(
    "open destination browsing blocks applying the previous plan",
    await page.eval(() => document.querySelector('[data-action="sample-apply"]').disabled)
  );
  check(
    "shared folder picker includes path input and excludes real folder creation",
    await page.eval(() => !!document.querySelector('[aria-label="목적지 경로 직접 입력"]') && !document.querySelector('[aria-label="현재 위치에 새 항목 만들기"]'))
  );
  await page.eval(() => document.querySelector('[aria-label="목적지 경로 직접 입력"] input').focus());
  check(
    "shared path form blocks synthetic composing Enter",
    await page.eval(() => !document.querySelector('[aria-label="목적지 경로 직접 입력"] input').dispatchEvent(new KeyboardEvent(
      'keydown',
      { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }
    )))
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }
  );
  await page.send('Input.insertText', { text: '샘플 자료/정리한 자료/학습' });
  await click(page, '[aria-label="목적지 경로 직접 입력"] button[type="submit"]');
  await waitFor(page, () => document.querySelector('[aria-label="학습 폴더를 목적지로 선택"]'));
  await page.screenshot({ path: `${output}/destination-1440.png`, format: 'png', fullPage: true });
  await click(page, '[aria-label="학습 폴더를 목적지로 선택"]');
  check(
    "shared path selection updates the destination and enables the plan",
    await page.eval(() => document.getElementById('destination-text-001').value === 'learning'
      && !document.querySelector('[data-action="sample-apply"]').disabled)
  );
  await click(page, '[data-browse-for="text-001"]');
  await waitFor(page, () => document.querySelector('[data-destination-phase="ready"]'));
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === '목적지 탐색 취소').click());
  await waitFor(
    page,
    () => !document.querySelector('[data-destination-phase]') && document.activeElement.id === 'browse-text-001'
  );
  check(
    "picker cancellation keeps the destination and restores focus",
    await page.eval(() => !document.querySelector('[data-destination-phase]')
      && document.getElementById('destination-text-001').value === 'learning'
      && document.activeElement.id === 'browse-text-001')
  );
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.screenshot({ path: `${output}/review-1440.png`, format: "png", fullPage: true });
  await page.setViewport({ width: 390, height: 1000 });
  check(
    "review at 390: no overflow",
    await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
  );
  await page.screenshot({ path: `${output}/review-390.png`, format: "png", fullPage: true });
  await page.setViewport({ width: 1440, height: 1000 });
  await click(page, '[data-action="sample-apply"]');
  await waitFor(page, () => document.querySelector('[data-sample-phase="result"]'));
  check(
    "explicit approval applies edited destination",
    (await locationOf(page, "text-001")) === "learning"
  );
  writeFileSync(`${output}/before-refresh.json`, JSON.stringify(await page.eval(() => ({
    saved: Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key.startsWith('moa.sample.v1.'))),
    text: document.body.innerText.slice(0, 900),
  })), null, 2));
  await page.goto(base + '/demo/files', { settleMs: 250 });
  await waitFor(page, () => document.querySelector('[data-sample-phase="result"]'));
  check(
    "refresh restores the result without replay",
    (await locationOf(page, "text-001")) === "learning"
  );
  check(
    "storage key is sample-specific, production storage sentinel remains",
    await page.eval(() => localStorage.getItem('sample-live-sentinel') === 'preserved'
      && Object.keys(sessionStorage).filter(key => key.startsWith('moa.sample.v1.')).length === 1)
  );

  const second = await browser.newPage({ width: 1440, height: 1000 });

  await second.goto(base + '/demo/files', { settleMs: 250 });
  await waitFor(second, () => document.querySelector('[data-sample-ready="true"]'));
  check(
    "another tab starts with separate unchanged sample state",
    (await locationOf(second, "text-001")) === null
  );
  await second.close();
  await click(page, '[data-action="sample-undo"]');
  check("undo restores prior sample positions", (await locationOf(page, "text-001")) === null);
  await click(page, '[data-action="sample-propose"]');
  await click(page, '[data-action="sample-apply"]');
  await click(page, '[data-action="sample-reset"]');
  check(
    "reset returns every sample to its initial state",
    await page.eval(() => [...document.querySelectorAll('[data-location-for]')].every(element => element.textContent === '받은 자료')
      && !document.querySelector('[data-action="sample-undo"]'))
  );

  await click(page, '[data-sample-id="text-015"] input');
  await click(page, '[data-action="sample-propose"]');
  check(
    "ambiguous sample blocks application until destination chosen",
    await page.eval(() => document.querySelector('[data-action="sample-apply"]').disabled && document.body.innerText.includes('목적지 확인이 필요한 자료 1개'))
  );
  await page.eval(() => {
    const select = document.getElementById('destination-text-015');

    select.value = 'travel';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  check(
    "choosing ambiguous destination enables application",
    await page.eval(() => !document.querySelector('[data-action="sample-apply"]').disabled)
  );
  await click(page, '[data-sample-id="sample-pdf"] button');
  check(
    "document preview remains available during review",
    await page.eval(() => !!document.querySelector('details[open] [aria-label$="PDF 페이지 미리보기"]'))
  );
  await page.send(
    'Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }
  );

  const motionBefore = await page.eval(() => window.sampleMotion.length);

  await click(page, '[data-action="sample-apply"]');
  check(
    "reduced motion skips workflow animations during a real phase change",
    await page.eval(() => window.sampleMotion.length) === motionBefore
  );
  check(
    "no real folder IO after all interactions",
    await page.eval(() => window.sampleIO.length === 0)
  );

  const auth = await page.eval(async () => {
    const response = await fetch('/api/auth/get-session');
    const data = await response.json();

    return { status: response.status, unauthenticated: data === null, code: data?.code };
  });

  observations.push({ name: "production get-session API", ...auth });

  if (auth.status === 200) check("production API returns no authenticated session", auth.unauthenticated);
  else {
    assert.equal(auth.status, 503);
    assert.equal(auth.code, 'AUTHENTICATION_UNAVAILABLE');
  }

  check(
    "production files remain protected",
    await page.eval(async () => {
      const response = await fetch('/files');
      const html = await response.text();
      const redirected = new URL(response.url).pathname === '/login'
        || new DOMParser().parseFromString(html, 'text/html')
          .querySelector('meta[http-equiv="refresh"]')?.getAttribute('content') === '1;url=/login';

      return redirected && !new DOMParser().parseFromString(html, 'text/html')
        .querySelector('[data-listing-phase]');
    })
  );
  check(
    "unknown sample document is rejected",
    await page.eval(async () => (await fetch('/demo/assets/not-registered')).status === 404)
  );
  await page.send(
    'Network.setCookie',
    {
      url: base + '/demo',
      name: 'moa.sample-session',
      value: 'invalid-fixture',
      path: '/demo',
      httpOnly: true
    }
  );
  check(
    "invalid sample session cannot read assets",
    await page.eval(async () => (await fetch('/demo/assets/sample-pdf')).status === 401)
  );
  check("no browser exception", page.consoleErrors.length === 0, page.consoleErrors);
  await page.close();
} finally {
  await browser.close();
  writeFileSync(
    `${output}/checks.json`,
    JSON.stringify({ at: new Date().toISOString(), checks, visual, observations }, null, 2)
  );
}

console.log(JSON.stringify({ checks: checks.length, failed: checks.filter(check => !check.passed).length }));
