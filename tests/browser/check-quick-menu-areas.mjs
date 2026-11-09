import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const output = process.argv[3] ?? "docs/verification/quick-menu-scope";
const base = process.argv[2] ?? "http://127.0.0.1:3034";
mkdirSync(output, { recursive: true });
const results = [];
const check = (name, passed) => { results.push({ name, passed: !!passed }); assert.ok(passed, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"] });
const wait = async (page, predicate) => { for (let i = 0; i < 140; i++) { if (await page.eval(`Boolean((${predicate.toString()})())`)) return; await pause(30); } throw Error("Quick menu/drawer UI did not settle"); };
const click = (page, selector) => page.eval(selector => { const node = document.querySelector(selector); node.focus(); node.click(); }, selector);
const key = (page, type, key, code, modifiers = 0) => page.send("Input.dispatchKeyEvent", { type, key, code, modifiers });
const mouse = (page, type, x, y, buttons = 0) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, buttons });

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.drawerAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.id==='conversation-materials')window.drawerAnimations.push({state:this.dataset.drawerState,duration:options.duration,frames});return animate.call(this,frames,options)};` });
  for (const route of ["/demo", "/demo/files", "/demo/settings?tab=controls"]) {
    await page.goto(base + route, { settleMs: 300 });
    await wait(page, () => document.querySelector('[data-workspace-quick-menu]'));
    check(`${route}: no upper-right quick switch button`, await page.eval(() => !document.querySelector('header [aria-label="빠른 전환 열기"]')));
    await mouse(page, 'mousePressed', 8, 450, 1); await pause(620);
    check(`${route}: blank workspace outside chat opens quick menu`, await page.eval(() => !!document.querySelector('[data-quick-switch-menu]')));
    await mouse(page, 'mouseReleased', 8, 450);
    await wait(page, () => !document.querySelector('[data-quick-switch-menu]'));
    await page.eval(() => document.activeElement?.blur());
    await key(page, 'keyDown', 'q', 'KeyQ', 1);
    check(`${route}: shared shortcut works`, await page.eval(() => !!document.querySelector('[data-quick-switch-menu]')));
    await key(page, 'keyUp', 'q', 'KeyQ', 1);
    await wait(page, () => !document.querySelector('[data-quick-switch-menu]'));
  }
  await click(page, '[aria-label="빠른 전환 열기"]');
  check("settings retains a visible keyboard/click preview alternative", await page.eval(() => document.querySelector('[data-quick-switch-menu]')?.dataset.quickMode === 'click'));
  await key(page, 'keyDown', 'Escape', 'Escape'); await key(page, 'keyUp', 'Escape', 'Escape');
  await page.goto(base + "/demo", { settleMs: 250 });
  const addOverlay = () => page.eval(() => { const overlay = document.createElement('div'); overlay.dataset.navigationLoading = ''; document.body.append(overlay); });
  const removeOverlay = () => page.eval(() => document.querySelector('[data-navigation-loading]').remove());
  await mouse(page, 'mousePressed', 8, 450, 1); await pause(200); await addOverlay(); await pause(420);
  check("overlay appearing during hold prevents delayed opening", await page.eval(() => !document.querySelector('[data-quick-switch-menu]')));
  await mouse(page, 'mouseReleased', 8, 450); await removeOverlay();
  await mouse(page, 'mousePressed', 8, 450, 1); await pause(620);
  await mouse(page, 'mouseMoved', 8, 150, 1); await addOverlay(); await mouse(page, 'mouseReleased', 8, 150);
  await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await pause(180);
  check("overlay appearing before pointer release cancels navigation", await page.eval(() => location.pathname === '/demo' && !document.querySelector('[data-quick-switch-menu]'))); await removeOverlay();
  await key(page, 'keyDown', 'q', 'KeyQ', 1); await pause(50);
  await key(page, 'keyDown', 'Home', 'Home'); await key(page, 'keyUp', 'Home', 'Home');
  await addOverlay(); await key(page, 'keyUp', 'q', 'KeyQ', 1);
  await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await pause(180);
  check("overlay appearing before key release cancels navigation", await page.eval(() => location.pathname === '/demo' && !document.querySelector('[data-quick-switch-menu]'))); await removeOverlay();
  await page.eval(() => { window.originalComposer = document.getElementById('message-draft'); });
  await click(page, '[aria-controls="conversation-materials"]');
  await wait(page, () => document.getElementById('conversation-materials').dataset.drawerState === 'open');
  check("drawer opening uses 260ms transform/opacity motion", await page.eval(() => window.drawerAnimations.some(item => item.state === 'opening' && item.duration === 260 && item.frames[0].opacity === '0' && item.frames[0].transform !== 'none')));
  await click(page, '[aria-label="자료 창 닫기"]');
  check("drawer remains open during exit animation", await page.eval(() => document.getElementById('conversation-materials').open && document.getElementById('conversation-materials').dataset.drawerState === 'closing'));
  await wait(page, () => !document.getElementById('conversation-materials').open);
  check("exit completes before focus returns and input DOM survives", await page.eval(() => document.activeElement.getAttribute('aria-controls') === 'conversation-materials' && document.getElementById('message-draft') === window.originalComposer && window.drawerAnimations.some(item => item.state === 'closing')));
  await click(page, '[aria-controls="conversation-materials"]'); await pause(40);
  await click(page, '[aria-label="자료 창 닫기"]'); await pause(40);
  await click(page, '[aria-controls="conversation-materials"]');
  await wait(page, () => document.getElementById('conversation-materials').dataset.drawerState === 'open'); await pause(300);
  check("rapid reversal cancels obsolete close completion", await page.eval(() => document.getElementById('conversation-materials').open));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await wait(page, () => document.getElementById('conversation-materials').dataset.drawerState === 'open');
    check(`${width}: adaptive animated drawer fits`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('conversation-materials').scrollWidth <= document.getElementById('conversation-materials').clientWidth));
    await page.screenshot({ path: `${output}/drawer-${width}.png`, format: 'png' });
  }
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await pause(50);
  const before = await page.eval(() => window.drawerAnimations.length);
  await click(page, '[aria-label="자료 창 닫기"]'); await click(page, '[aria-controls="conversation-materials"]');
  check("reduced motion switches immediately without animation", await page.eval(before => document.getElementById('conversation-materials').open && document.getElementById('conversation-materials').dataset.drawerState === 'open' && window.drawerAnimations.length === before, before));
  await click(page, '[aria-label="자료 창 닫기"]');
  for (const route of ["/login", "/welcome", "/forgot-password", "/reset-password", "/preview"]) {
    await page.goto(base + route, { settleMs: 180 });
    await page.eval(() => document.activeElement?.blur());
    check(`${route}: public/auth view has no work scope`, await page.eval(() => !document.querySelector('[data-workspace-quick-menu]')));
    await mouse(page, 'mousePressed', 8, 450, 1); await pause(540); await mouse(page, 'mouseReleased', 8, 450);
    await key(page, 'keyDown', 'q', 'KeyQ', 1);
    check(`${route}: hold and shortcut are ignored and no explicit opener is exposed`, await page.eval(() => !document.querySelector('[data-quick-switch-menu]') && !document.querySelector('[aria-label="빠른 전환 열기"]')));
    await key(page, 'keyUp', 'q', 'KeyQ', 1);
  }
  check("no browser exceptions", page.consoleErrors.length === 0);
} finally {
  await browser.close();
  writeFileSync(`${output}/scope-drawer-checks.json`, JSON.stringify({ condition: 'Actual local production sample workspace and guest auth routes; no AI calls or personal folders', results }, null, 2));
}
console.log(JSON.stringify({ checks: results.length, passed: true }));
