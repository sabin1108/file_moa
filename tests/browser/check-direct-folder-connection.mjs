import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";
const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = "docs/verification/workspace-details";
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: resolve("apps/web"), logLevel: "error", server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{ name: "navigation-fixture", configureServer(server) { server.middlewares.use("/__navigation-fixture", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/connection-workspace.tsx"></script></html>');
  }); } }],
});
await server.listen();
const port = server.httpServer.address().port;
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"] });
const results = [];
const check = (name, passed) => { results.push({ name, passed: !!passed }); assert.ok(passed, name); };
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})(); const picker=window.showDirectoryPicker; window.pickerCalls=[]; window.showDirectoryPicker=(options)=>{window.pickerCalls.push({active:navigator.userActivation.isActive,options});return picker(options)};` });
  await page.goto(`http://127.0.0.1:${port}/__navigation-fixture`, { settleMs: 500 });
  const wait = async predicate => { for (let i = 0; i < 200; i++) { if (await page.eval(`Boolean((${predicate.toString()})())`)) return; await new Promise(resolve => setTimeout(resolve, 30)); }
    writeFileSync(`${output}/connection-failure.json`, JSON.stringify(await page.eval(() => ({ text: document.body.innerText, buttons: [...document.querySelectorAll('[aria-label="연결 폴더 구조"] button')].map(node => ({ title: node.title, disabled: node.disabled, ariaDisabled: node.getAttribute('aria-disabled') })) })), null, 2));
    throw Error('Connection fixture timed out: '+JSON.stringify(page.consoleErrors)); };
  const click = async selector => { const point = await page.eval(selector => { const node = document.querySelector(selector); for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true; node.scrollIntoView({ block: "center" }); const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, selector);
    for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }); };
  await wait(() => document.querySelector('[data-conversation-workspace] button:not(:disabled)'));
  check("disconnected chat keeps one editable composer and no open drawer", await page.eval(() => !!document.getElementById('message-draft') && !document.getElementById('message-draft').readOnly && document.querySelectorAll('#message-draft').length === 1 && !document.getElementById('conversation-materials').open && window.pickerCalls.length === 0));
  await page.eval(async () => {
    await listingProbe.prepare(); listingProbe.preparing = true;
    try {
      const a = await listingProbe.a.getDirectoryHandle('A', { create: true });
      const hidden = await a.getDirectoryHandle('.hidden', { create: true });
      await hidden.getDirectoryHandle('deep', { create: true });
      await a.getDirectoryHandle('Z', { create: true });
      for (const name of ['A-2', 'A.B', '같은 깊이의 아주 긴 이름을 확인하는 합성 폴더']) await listingProbe.a.getDirectoryHandle(name, { create: true });
    } finally { listingProbe.preparing = false; }
  });
  await page.eval(() => { listingProbe.pickerMode = 'cancel'; });
  await click('[data-conversation-workspace] [aria-label="자료 폴더 연결"] button');
  await wait(() => document.querySelector('[data-conversation-workspace]').textContent.includes('폴더 연결을 마치지 않았어요'));
  check("cancelling direct picker retains the editable composer and restores the button", await page.eval(() => pickerCalls.length === 1 && pickerCalls[0].active && document.activeElement.textContent === '폴더 연결' && !!document.getElementById('message-draft') && !document.getElementById('message-draft').readOnly));
  await page.eval(() => { listingProbe.pickerMode = 'success'; });
  await click('[data-conversation-workspace] [aria-label="자료 폴더 연결"] button');
  await wait(() => document.querySelector('[data-folder-tree-root]'));
  check("direct chat click connects through the real Provider with read permission", await page.eval(() => pickerCalls.length === 2 && pickerCalls.every(call => call.active && call.options.mode === 'read') && !!document.getElementById('message-draft')));
  await wait(() => document.activeElement.hasAttribute('data-folder-tree-root'));
  await wait(() => document.querySelector('[data-workspace-sidebar]').textContent.includes('하위 자료'));
  check("successful connect focuses folder root and lazy children", await page.eval(() => document.querySelector('[data-workspace-sidebar]').textContent.includes('하위 자료') && listingProbe.productWrites === 0 && listingProbe.productBodyReads === 0));
  await click('[aria-label="연결 폴더 구조"] button[title="A"]');
  await wait(() => document.querySelector('[aria-label="연결 폴더 구조"] button[title="A / .hidden"]'));
  await click('[aria-label="연결 폴더 구조"] button[title="A / .hidden"]');
  await wait(() => document.querySelector('[aria-label="연결 폴더 구조"] button[title="A / .hidden / deep"]'));
  check("real nested tree groups descendants under their parent", await page.eval(() => {
    const deep = document.querySelector('[title="A / .hidden / deep"]').closest('li');
    return deep.parentElement.closest('li').dataset.folderPath === '["A",".hidden"]' && deep.parentElement.closest('li').parentElement.closest('li').dataset.folderPath === '["A"]';
  }));
  check("same-depth real folder icons align independently of label length", await page.eval(() => {
    const titles = ['A', 'A-2', 'A.B', '같은 깊이의 아주 긴 이름을 확인하는 합성 폴더'];
    const x = titles.map(title => document.querySelector('[aria-label="연결 폴더 구조"] button[title="' + title + '"] svg').getBoundingClientRect().x);
    const childX = document.querySelector('[title="A / .hidden"] svg').getBoundingClientRect().x;
    return x.every(value => Math.abs(value - x[0]) < 1) && childX > x[0] && getComputedStyle(document.querySelector('[title="A / .hidden / deep"]').closest('ul')).borderLeftStyle === 'solid';
  }));
  check("settings is directly above the account footer", await page.eval(() => {
    const settings = document.querySelector('[data-workspace-sidebar] [href="/settings"]');
    const account = document.querySelector('[data-workspace-sidebar] [href="/account"]');
    return settings.nextElementSibling === account && settings.getBoundingClientRect().bottom <= account.getBoundingClientRect().top;
  }));
  await page.screenshot({ path: `${output}/connected-fixture-1440.png`, format: "png" });
  await click('[data-fixture-toggle]');
  await wait(() => document.querySelector('[aria-label="복구 보관함 설정"]'));
  await wait(() => document.querySelector('[aria-label="자료 폴더 연결"] button:not(:disabled)'));
  await click('[aria-label="자료 폴더 연결"] button');
  await wait(() => document.activeElement.textContent === '복구 보관함');
  check("vault heading keeps focus without full width blue outline", await page.eval(() => getComputedStyle(document.activeElement).outlineStyle === 'none' && document.activeElement.tagName === 'H3'));
  await page.screenshot({ path: `${output}/vault-focus-fixture.png`, format: "png" });
  check("fixture writes no original data", await page.eval(() => listingProbe.productWrites === 0 && listingProbe.productBodyReads === 0));
  check("no component exceptions", page.consoleErrors.length === 0);
} finally {
  await browser.close(); await server.close();
  writeFileSync(`${output}/direct-connection-checks.json`, JSON.stringify({ condition: "Actual Provider/LiveConversation/Settings components, synthetic owner and Chromium OPFS; Next routing shim; no authenticated route or physical disk claim", results }, null, 2));
}
console.log(JSON.stringify({ checks: results.length, passed: true }));
