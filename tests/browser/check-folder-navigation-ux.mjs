import { finishSourceSetup } from '../fixtures/finish-source-setup.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
const base = process.argv[2] || 'http://127.0.0.1:3011';
const out = process.argv[3] || 'docs/verification/folder-navigation-ux/browser';
mkdirSync(out, { recursive: true });
const checks = [];
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
let page;
function check(name, passed, detail) { checks.push({ name, passed: !!passed, detail }); assert.ok(passed, `${name}: ${JSON.stringify(detail)}`); }
async function wait(fn) { for (let n=0;n<300;n++) { if (await page.eval(fn)) return; await new Promise(r=>setTimeout(r,30)); } throw Error(`Timeout ${fn}`); }
async function point(label) {
  return page.eval(async label => {
    await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));
    const root=document.querySelector('dialog:modal')??document;
    const e=[...root.querySelectorAll('button,input,summary')].find(e=>!e.disabled && e.checkVisibility() && (e.textContent.trim()===label||e.getAttribute('aria-label')===label));
    if(!e) throw Error(`Missing ${label}`);
    e.scrollIntoView({block:'center'}); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
  },label);
}
async function click(label) { const p=await point(label); for(const type of ['mousePressed','mouseReleased']) await page.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1}); }
const ready=()=>wait(()=>document.querySelector('[data-listing-phase]')?.dataset.listingPhase==='ready');
const pickerReady=()=>wait(()=>document.querySelector('[data-destination-phase]')?.dataset.destinationPhase==='ready');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function down(label) { const p=await point(label); await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1}); return p; }
async function up(p) { await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1}); }
async function screenshot(name) {
  await page.eval(async()=>{await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));});
  await page.screenshot({path:`${out}/${name}.png`,format:'png'});
}
try {
  page=await browser.newPage({width:1440,height:900});
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${installFolderBrowserFixture.toString()})();`});
  await page.goto(base+'/files',{settleMs:250}); await click('폴더 연결 관리'); await click('폴더 연결'); await finishSourceSetup(page); await ready();
  await page.eval(async()=>{ listingProbe.preparing=true; try {
    const child=await listingProbe.a.getDirectoryHandle('하위 자료');
    await (await child.getDirectoryHandle('프로젝트',{create:true})).getDirectoryHandle('초안',{create:true});
  } finally {listingProbe.preparing=false;} });
  await revealSelectionControl(page, '읽기 안내.md 선택'); await click('복사'); await click('목적지 선택'); await pickerReady();
  for(let n=0;n<20;n++) {
    await click('하위 자료 목적지 폴더 열기'); await pickerReady();
    check(`one path form after child ${n}`,await page.eval(()=>document.querySelectorAll('[aria-label="목적지 경로 직접 입력"]').length===1 && document.querySelector('[aria-label="목적지 경로 직접 입력"] input').value==='하위 자료' && document.querySelectorAll('[data-destination-phase] form[aria-label="새로 만들기"]').length===1));
    await click('상위 폴더'); await pickerReady();
    check(`one path form after parent ${n}`,await page.eval(()=>document.querySelectorAll('[aria-label="목적지 경로 직접 입력"]').length===1 && document.querySelector('[aria-label="목적지 경로 직접 입력"] input').value===''));
  }
  await click('하위 자료 목적지 폴더 열기'); await pickerReady();
  await click('프로젝트 목적지 폴더 열기'); await pickerReady();
  await click('초안 목적지 폴더 열기'); await pickerReady();
  check('picker parent button names actual parent',await page.eval(()=>document.querySelector('[data-destination-phase] button[aria-label="상위 폴더"]').textContent.includes('프로젝트')));
  await click('하위 자료 상위 경로로 이동'); await pickerReady();
  check('picker ancestor goes directly to requested level',await page.eval(()=>document.querySelector('[aria-label="목적지 경로 직접 입력"] input').value==='하위 자료'));
  await click('프로젝트 목적지 폴더 열기'); await pickerReady(); await click('초안 목적지 폴더 열기'); await pickerReady(); await click('초안 폴더를 목적지로 선택');
  await click('계획 만들기'); await wait(()=>document.querySelector('[data-plan-phase]')?.dataset.planPhase==='ready');
  check('each destination folder has its own increasing depth',await page.eval(()=>{
    const tree=document.querySelector('[aria-label="검증 자료 A / 하위 자료 / 프로젝트 / 초안 / 읽기 안내.md"]');
    return [...tree.children].map(e=>e.dataset.depth).join(',')==='0,1,2,3,4' && tree.children[3].getBoundingClientRect().left>tree.children[1].getBoundingClientRect().left;
  }));
  for(const width of [390,768,1440,1920]) {
    await page.setViewport({width,height:900});
    await page.eval(()=>{document.querySelector('dialog:modal').scrollTop=0;});
    check(`deep tree contained ${width}`,await page.eval(()=>document.documentElement.scrollWidth<=innerWidth && document.querySelector('dialog:modal').scrollWidth<=document.querySelector('dialog:modal').clientWidth));
    await page.eval(()=>document.querySelector('[aria-label="변경 계획 결과"]').scrollIntoView({block:'start'}));
    await screenshot(`deep-tree-${width}`);
  }
  await click('복사 전 검사'); await wait(()=>document.querySelector('[data-copy-inspection]')?.dataset.copyInspection==='ready');
  check('step does not replay whole-area entrance',await page.eval(()=>{const e=document.querySelector('[data-copy-inspection]').parentElement; return getComputedStyle(e).animationName==='none';}));
  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  check('reduced motion suppresses step transition',await page.eval(()=>getComputedStyle(document.querySelector('[data-copy-inspection]').parentElement).animationName==='none'));
  await page.send('Emulation.setEmulatedMedia',{features:[]});
  await click('계획 닫기'); await click('전체 선택 해제');
  const filePoint=await down('읽기 안내.md 미리보기'); await pause(120);
  check('holding shows selection progress',await page.eval(()=>!!document.querySelector('[data-holding="true"]')));
  await pause(600); await up(filePoint);
  check('long press selects file without preview',await page.eval(()=>document.querySelector('[aria-label="읽기 안내.md 선택"]').checked && !document.querySelector('[data-preview-phase]') && !document.querySelector('[data-holding]')));
  await click('전체 선택 해제');
  const folderPoint=await down('하위 자료 폴더 열기'); await pause(720); await up(folderPoint);
  check('long press selects folder without navigating',await page.eval(()=>document.querySelector('[aria-label="하위 자료 폴더 선택"]').checked && document.querySelector('[data-listing-phase] h2').textContent==='검증 자료 A'));
  check('folder selection explains unsupported recursive actions',await page.eval(()=>['복사','이동'].every(t=>[...document.querySelectorAll('[aria-label="파일 선택"] button')].find(b=>b.textContent===t).disabled) && document.querySelector('[aria-label="파일 선택"]').textContent.includes('폴더 전체의 복사·이동은 아직 지원하지')));
  await click('전체 선택 해제');
  const moving=await down('하위 자료 폴더 열기'); await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:moving.x+20,y:moving.y,button:'left',buttons:1}); await pause(720); await up({x:moving.x+20,y:moving.y});
  check('drag cancels selection and accidental open',await page.eval(()=>!document.querySelector('[aria-label="하위 자료 폴더 선택"]').checked && document.querySelector('[data-listing-phase] h2').textContent==='검증 자료 A'));
  const cancelled=await down('읽기 안내.md 미리보기'); await page.eval(()=>window.dispatchEvent(new Event('blur'))); await pause(720); await up(cancelled);
  check('blur cancels pending hold',await page.eval(()=>!document.querySelector('[aria-label="읽기 안내.md 선택"]').checked && !document.querySelector('[data-preview-phase]')));
  await click('하위 자료 폴더 열기'); await ready(); await click('프로젝트 폴더 열기'); await ready(); await click('초안 폴더 열기'); await ready();
  await page.setViewport({width:390,height:900});
  check('mobile exposes intermediate ancestor controls and named parent',await page.eval(()=>[...document.querySelectorAll('[aria-label="현재 폴더 위치"] button')].every(e=>e.checkVisibility()) && document.querySelector('[data-listing-phase] button[aria-label="상위 폴더"]').textContent.includes('프로젝트')));
  await click('상위 폴더'); await ready(); check('parent action reaches actual parent',await page.eval(()=>document.querySelector('[data-listing-phase] h2').textContent==='프로젝트'));
  await screenshot('parent-390');
  await click('하위 자료'); await ready();
  check('mobile breadcrumb reaches ancestor directly',await page.eval(()=>document.querySelector('[data-listing-phase] h2').textContent==='하위 자료'));
  await click('상위 폴더'); await ready();
  await page.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await page.eval(()=>{ window.touchTrace=[]; for(const type of ['pointerdown','pointerup','pointercancel','contextmenu','scroll','blur']) window.addEventListener(type,e=>touchTrace.push({type,time:performance.now(),target:e.target.tagName,label:e.target.getAttribute?.('aria-label'),pointer:e.pointerType,primary:e.isPrimary,button:e.button}),true); });
  const touch=await point('읽기 안내.md 미리보기'); await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]}); await pause(720); await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  check('touch hold enters file selection',await page.eval(()=>document.querySelector('[aria-label="읽기 안내.md 선택"]').checked && !document.querySelector('[data-preview-phase]')),await page.eval(()=>({trace:touchTrace,selected:document.querySelector('[aria-label="읽기 안내.md 선택"]').checked,preview:document.querySelector('[data-preview-phase]')?.dataset.previewPhase})));
  await page.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await screenshot('selected-390');
  await click('전체 선택 해제');
  const multi=await down('하위 자료 폴더 열기'); await pause(720);
  check('long press suppresses its context menu across shifted rows',await page.eval(()=>!document.querySelector('[aria-label="읽기 안내.md 미리보기"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))));
  await page.eval(()=>document.querySelector('[aria-label="하위 자료 폴더 열기"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:99,pointerType:'touch',isPrimary:false,button:0})));
  await up(multi);
  check('secondary pointer cannot release long-press click guard',await page.eval(()=>document.querySelector('[aria-label="하위 자료 폴더 선택"]').checked && document.querySelector('[data-listing-phase] h2').textContent==='검증 자료 A'));
  check('new right-button gesture is not mistaken for the previous hold',await page.eval(()=>{const e=document.querySelector('[aria-label="하위 자료 폴더 열기"]');e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:2,pointerId:1}));return e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));}));
  await click('전체 선택 해제');
  const unsupported=await page.eval(async()=>{const row=document.querySelector('[aria-label="지원하지 않는 사진.pdf 선택"]').closest('[data-selecting]'); row.scrollIntoView({block:'center'}); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); const r=row.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
  await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...unsupported,button:'left',clickCount:1}); await pause(720); await up(unsupported);
  check('unsupported preview format still supports long-press selection',await page.eval(()=>document.querySelector('[aria-label="지원하지 않는 사진.pdf 선택"]').checked && !document.querySelector('[data-preview-phase]')));
  await page.eval(()=>document.querySelector('[aria-label="지원하지 않는 사진.pdf 선택"]').focus());
  for(const type of ['keyDown','keyUp']) await page.send('Input.dispatchKeyEvent',{type,key:' ',code:'Space',windowsVirtualKeyCode:32});
  check('keyboard checkbox remains an alternative to holding',await page.eval(()=>!document.querySelector('[aria-label="지원하지 않는 사진.pdf 선택"]').checked));
  check('source unchanged and no product writes',await page.eval(async()=>listingProbe.productWrites===0 && JSON.stringify(await listingProbe.sentinel())===JSON.stringify(listingProbe.before)));
  check('no browser exceptions',page.consoleErrors.length===0,page.consoleErrors);
} finally {
  writeFileSync(`${out}/checks.json`,JSON.stringify({checks,errors:page?.consoleErrors},null,2));
  await browser.close();
}
console.log(`${checks.length} navigation UX checks passed`);
