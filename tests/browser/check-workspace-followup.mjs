import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/workspace-followup/browser';
mkdirSync(out, { recursive: true });
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
let page;
const checks = [], frames = [];
function check(name, passed, detail) { checks.push({ name, passed: !!passed, detail }); assert.ok(passed, `${name}: ${JSON.stringify(detail)}`); }
const pause = ms => new Promise(r => setTimeout(r, ms));
async function wait(fn) { for (let i = 0; i < 350; i++) { if (await page.eval(fn)) return; await pause(25); } throw Error(`Timeout ${fn}: ${await page.eval(() => document.body.innerText)}`); }
async function click(label) {
  const p = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const e = [...root.querySelectorAll('button,input,summary')].find(e => !e.disabled && e.checkVisibility() && (e.textContent.trim() === label || e.getAttribute('aria-label') === label));
    if (!e) throw Error(`Missing ${label}`); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...p, button: 'left', clickCount: 1 });
}
async function key(key = ' ', code = 'Space', windowsVirtualKeyCode = 32) { for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode }); }
async function input(selector, value) {
  await page.eval(selector => { const e = document.querySelector(selector); e.focus(); e.select(); }, selector);
  await page.send('Input.insertText', { text: value });
}
const ready = () => wait(() => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
async function holdPrevious(name) {
  await wait(() => !!document.querySelector('[aria-label="상위 폴더에서 확인한 항목"] button'));
  const p = await page.eval(name => {
    const e = [...document.querySelectorAll('[aria-label="상위 폴더에서 확인한 항목"] button')].find(e => e.querySelector('span')?.textContent === name);
    if (!e) throw Error(`Missing previous ${name}: ${document.querySelector('[aria-label="상위 폴더에서 확인한 항목"]').innerHTML}`);
    e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, name);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await pause(720);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); await ready();
}
try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(base + '/files', { settleMs: 250 }); await click('폴더 연결 관리'); await click('폴더 연결'); await finishSourceSetup(page); await ready();
  check('permanent select button removed', await page.eval(() => ![...document.querySelectorAll('button')].some(e => e.textContent.trim() === '선택')));
  await page.eval(() => document.querySelector('[aria-label="읽기 안내.md 미리보기"]').focus()); await key();
  check('Space enters selection without opening preview', await page.eval(() => document.querySelector('[aria-label="읽기 안내.md 선택"]').checked && !document.querySelector('[data-preview-phase]')));
  await page.eval(() => document.querySelector('[aria-label="읽기 안내.md 선택"]').focus()); await key();
  check('last uncheck exits and preserves keyboard focus', await page.eval(() => !document.querySelector('[aria-label="파일 선택"]').checkVisibility() && document.activeElement.getAttribute('aria-label') === '읽기 안내.md 미리보기'));
  await key(); await click('할 일.txt 선택'); await click('전체 선택 해제');
  check('clear all exits and restores visible focus', await page.eval(() => !document.querySelector('[data-selected=true]') && !document.querySelector('[aria-label="파일 선택"]').checkVisibility() && document.activeElement.tagName === 'H2'));
  await page.eval(() => document.querySelector('[aria-label="읽기 안내.md 미리보기"]').focus()); await key();
  await page.eval(() => document.querySelector('[aria-label="파일 선택"] input').focus()); await key(); await key();
  check('unchecking master exits with visible focus', await page.eval(() => !document.querySelector('[data-selected=true]') && document.activeElement === document.querySelector('[data-listing-phase] h2')));
  await click('하위 자료 폴더 열기'); await ready(); await holdPrevious('읽기 안내.md');
  check('previous-column file hold returns to parent and selects without preview', await page.eval(() => document.querySelector('[data-listing-phase] h2').textContent === '검증 자료 A' && document.querySelector('[aria-label="읽기 안내.md 선택"]').checked && !document.querySelector('[data-preview-phase]')));
  await click('전체 선택 해제'); await click('하위 자료 폴더 열기'); await ready(); await holdPrevious('빈 폴더');
  check('previous-column folder hold selects and blocks recursive mutations', await page.eval(() => document.querySelector('[aria-label="빈 폴더 폴더 선택"]').checked && [...document.querySelectorAll('[aria-label="파일 선택"] button')].filter(e => ['복사', '이동'].includes(e.textContent)).every(e => e.disabled)));
  await click('전체 선택 해제');
  const beforeSearch = await page.eval(() => ({ bodies: listingProbe.productBodyReads, writes: listingProbe.productWrites }));
  await click('검색'); await input('[role=search] input', '하위 문서');
  await wait(() => document.querySelector('[aria-label="하위 폴더 포함 검색 결과"]')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('[aria-label="검색한 파일과 폴더"] li'));
  check('search finds descendant and displays containing location', await page.eval(() => document.querySelector('[aria-label="검색한 파일과 폴더"]').textContent.includes('하위 문서.txt') && document.querySelector('[aria-label="검색한 파일과 폴더"]').textContent.includes('검증 자료 A / 하위 자료')));
  check('search only reads names', await page.eval(before => listingProbe.productBodyReads === before.bodies && listingProbe.productWrites === before.writes, beforeSearch));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(`search contained ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${out}/search-${width}.png`, format: 'png' });
  }
  await page.eval(() => { listingProbe.holdRead = true; }); await input('[role=search] input', '회의');
  await wait(() => listingProbe.holds.length > 0); await click('검색 취소');
  await page.eval(() => { listingProbe.holdRead = false; listingProbe.holds.splice(0).forEach(r => r()); }); await pause(150);
  check('cancelled search does not publish late results', await page.eval(() => !document.querySelector('[aria-label="검색한 파일과 폴더"] li') && document.querySelector('[aria-label="하위 폴더 포함 검색 결과"]').textContent.includes('취소')));
  await input('[role=search] input', '하위 문서'); await wait(() => !!document.querySelector('[aria-label="검색한 파일과 폴더"] li'));
  await click('하위 문서.txt 위치 열기: 검증 자료 A / 하위 자료'); await ready();
  check('location opens the containing folder', await page.eval(() => document.querySelector('[data-listing-phase] h2').textContent === '하위 자료'));
  await click('상위 폴더'); await ready();
  await page.eval(() => document.querySelector('[aria-label="읽기 안내.md 미리보기"]').focus()); await key(); await click('복사'); await click('목적지 선택');
  await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  await input('[aria-label="목적지 경로 직접 입력"] input', '"D:\\sabin\\검증 자료 A\\빈 폴더"'); await click('경로 열기');
  check('absolute path proposes authorized relative candidate before reading', await page.eval(() => document.querySelector('[aria-label="목적지 경로 직접 입력"]').textContent.includes('검증 자료 A / 빈 폴더') && !!document.querySelector('[aria-label="검증 자료 A 폴더를 목적지로 선택"]')));
  await click('연결 폴더 기준으로 열기'); await wait(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready');
  check('confirmed Windows path opens connected child', await page.eval(() => document.querySelector('[aria-label="목적지 경로 직접 입력"] input').value === '빈 폴더'));
  await click('빈 폴더 폴더를 목적지로 선택');
  const routes = await page.eval(async () => {
    [...document.querySelectorAll('dialog:modal button')].find(e => e.textContent === '계획 만들기').click();
    while (!document.querySelector('[aria-label="변경 계획 결과"] dl')) await new Promise(requestAnimationFrame);
    const els = [...document.querySelectorAll('[aria-label="변경 계획 결과"] dl > div')];
    return els.map(e => ({ delay: getComputedStyle(e).animationDelay, duration: getComputedStyle(e).animationDuration }));
  });
  check('before then after reveals with fixed stagger', routes[0].delay === '0s' && routes[1].delay === '0.24s', routes);
  await page.eval(() => { listingProbe.holdRead = true; }); await click('복사 전 검사'); await wait(() => listingProbe.holds.length > 0);
  check('pending checks spin without success ticks', await page.eval(() => !document.querySelector('[data-checked=true]') && [...document.querySelectorAll('[aria-label="검사 항목"] path')].every(e => getComputedStyle(e).opacity === '0')));
  const sequence = await page.eval(async () => {
    listingProbe.holdRead = false; listingProbe.holds.splice(0).forEach(r => r());
    while (document.querySelector('[data-copy-inspection]').dataset.copyInspection !== 'ready') await new Promise(requestAnimationFrame);
    const start = performance.now(), values = [], d = document.querySelector('dialog:modal');
    while (performance.now() - start < 600) {
      values.push({ t: performance.now() - start, top: d.getBoundingClientRect().top, ticks: [...document.querySelectorAll('[aria-label="검사 항목"] path')].map(e => Number(getComputedStyle(e).opacity)) });
      await new Promise(requestAnimationFrame);
    }
    return values;
  }); frames.push(...sequence);
  check('successful ticks reveal left to right', sequence.some(f => f.ticks[0] > 0 && f.ticks[1] === 0 && f.ticks[2] === 0) && sequence.some(f => f.ticks[1] > 0 && f.ticks[2] === 0) && sequence.at(-1).ticks.every(v => v === 1), sequence);
  check('inspection reveal keeps dialog top stable', Math.max(...sequence.map(f => f.top)) - Math.min(...sequence.map(f => f.top)) < 1);
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  check('reduced motion shows final checks immediately', await page.eval(() => [...document.querySelectorAll('[aria-label="검사 항목"] path')].every(e => getComputedStyle(e).animationName === 'none' && getComputedStyle(e).opacity === '1')));
  await page.send('Emulation.setEmulatedMedia', { features: [] });
  for (const width of [390, 768, 1440, 1920]) { await page.setViewport({ width, height: 900 }); await page.screenshot({ path: `${out}/inspection-${width}.png`, format: 'png' }); }
  await click('계획 닫기'); await click('전체 선택 해제'); await click('작업 기록'); await wait(() => document.querySelector('[data-history-phase]')?.dataset.historyPhase === 'ready');
  check('history exposes three categories', await page.eval(() => [...document.querySelectorAll('[aria-label="작업 기록 종류"] button')].map(e => e.textContent).join(',') === '복사 0,이동 0,생성 0'));
  await click('이동 0'); check('move is empty and truthful', await page.eval(() => document.querySelector('dialog:modal').textContent.includes('실제 이동은 아직 지원하지 않습니다')));
  check('no source mutation or permission request', await page.eval(async () => listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0 && JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
} finally { writeFileSync(`${out}/checks.json`, JSON.stringify({ checks, frames, errors: page?.consoleErrors }, null, 2)); await browser.close(); }
console.log(`${checks.length} workspace follow-up checks passed`);
