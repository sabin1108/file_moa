import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? ".omx/verification/chat-usability-20261114/browser");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error",
  cacheDir: resolve(".omx/browser-cache/chat-usability"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"] },
  plugins: [{ name: "chat-usability", configureServer(server) {
    server.middlewares.use("/__usability", (_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>');
    });
  } }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
const checks = [];
let page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass) => { checks.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"}: ${name}`); assert.ok(pass, name); };
async function until(predicate, argument) {
  for (let i = 0; i < 500; i++) {
    if (await page.eval(`(async () => Boolean(await (${predicate.toString()})(${JSON.stringify(argument)})))()`)) return;
    await pause(30);
  }
  throw Error("Timeout: " + predicate);
}
async function click(text) {
  await until(text => [...document.querySelectorAll("button")].some(node => node.checkVisibility() && !node.disabled && (node.textContent.trim() === text || node.querySelector("strong")?.textContent === text || node.querySelector(":scope > span")?.textContent.trim() === text)), text);
  await page.eval(text => {
    const node = [...document.querySelectorAll("button")].find(node => node.checkVisibility() && (node.textContent.trim() === text || node.querySelector("strong")?.textContent === text || node.querySelector(":scope > span")?.textContent.trim() === text));
    node.focus(); node.click();
  }, text);
}
async function fill(selector, value) {
  await page.eval(selector => { const node = document.querySelector(selector); node.focus(); node.select(); }, selector);
  await page.send("Input.insertText", { text: value });
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();const originalPicker=window.showDirectoryPicker;window.pickerCalls=0;window.showDirectoryPicker=async options=>{window.pickerCalls++;if(options?.mode==='readwrite'){const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('AI 기록 검증',{create:true});}return originalPicker(options);};` });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__usability?tour`;
  await page.goto(url, { settleMs: 400 });
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  check("first visit opens a native modal tutorial", await page.eval(() => document.activeElement.id === "workspace-tour-title"));
  await page.screenshot({ path: resolve(output, "tour-1440.png"), format: "png" });
  await click("다음"); await click("이전");
  check("tour supports previous and next", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("1 / 9")));
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until(() => !document.querySelector('dialog:modal'));
  await page.goto(url, { settleMs: 350 });
  check("dismissed tour stays closed on the next visit", await page.eval(() => !document.querySelector('dialog:modal')));
  check("new chat asks for an action before showing input", await page.eval(() => !document.getElementById("message-draft") && document.querySelectorAll('[aria-label="시작할 작업 선택"] button').length === 4));
  await page.screenshot({ path: resolve(output, "start-1440.png"), format: "png" });
  await click("자료 찾기");
  await until(() => document.activeElement.id === "message-draft");
  check("selecting an action opens and focuses the input", await page.eval(() => document.querySelector('[aria-label="대화 작업"]').value === "find"));
  await fill("#message-draft", "보존할 한글 초안");
  await click("설정");
  check("advanced policy is folded into one section", await page.eval(() => { const node = document.querySelector('[aria-label="대화 설정 내용"]'); return node.querySelectorAll("details").length === 1 && !node.querySelector("details").open; }));
  await click("사용 방법 다시 보기");
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  check("replaying guidance preserves the draft", await page.eval(() => document.getElementById("message-draft").value === "보존할 한글 초안"));
  const historyBeforeGuide = await page.eval(() => history.length);
  const pickerBeforeGuide = await page.eval(() => window.pickerCalls);
  for (let step = 0; step < 8; step++) {
    await click("다음");
    await until(() => ![...document.querySelectorAll('dialog:modal button')].find(button => button.textContent === "다음" || button.textContent === "완료")?.disabled);
    await until(() => document.querySelector('dialog:modal [aria-hidden="true"]')?.getBoundingClientRect().width > 0);
    check(`guide step ${step + 2} highlights its actual control`, true);
  }
  await click("완료");
  await until(() => !document.querySelector('dialog:modal'));
  check("guide route changes keep history length and do not invoke the folder picker", await page.eval(expected => history.length === expected.history && window.pickerCalls === expected.pickers, { history: historyBeforeGuide, pickers: pickerBeforeGuide }));
  await page.eval(() => window.dispatchEvent(new CustomEvent("fixture-navigation", { detail: { href: "/settings?tab=controls", replace: false } })));
  await until(() => document.querySelector('a[href="/?guide=1"]'));
  await page.eval(() => document.querySelector('a[href="/?guide=1"]').click());
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  check("settings replay link opens the guide without remounting the workspace layout", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("1 / 9") && location.pathname === "/" && !location.search.includes("guide=1")));
  await click("건너뛰기");
  await until(() => !document.querySelector('dialog:modal'));
  await click("기록함");
  const pickers = await page.eval(() => window.pickerCalls);
  await click("저장 위치 선택");
  await until(() => document.querySelector('[aria-label="저장 기록"]').textContent.includes("이 대화 저장"));
  check("storage selection opens the picker directly once", await page.eval(() => window.pickerCalls) === pickers + 1);
  check("connecting a folder does not enable conversation saving", await page.eval(() => document.querySelector('[data-conversation-context]').textContent.includes("저장 안 함")));
  await click("프로필"); await click("프로필 만들기");
  await until(() => document.querySelector('textarea[placeholder^="예: 핵심"]'));
  await page.eval(() => document.querySelector('textarea[placeholder^="예: 핵심"]').closest("details").querySelector("summary").click());
  await fill('textarea[placeholder^="예: 핵심"]', "핵심부터 짧게, 예시를 함께");
  check("save button does not overlap the focused textarea", await page.eval(() => { const field = document.querySelector('textarea[placeholder^="예: 핵심"]'); const save = [...document.querySelectorAll("button")].find(node => node.checkVisibility() && node.textContent.trim() === "저장"); return save.getBoundingClientRect().top >= field.getBoundingClientRect().bottom && getComputedStyle(field).outlineColor === "rgba(0, 0, 0, 0)"; }));
  await page.screenshot({ path: resolve(output, "profile-1440.png"), format: "png" });
  await click("저장"); await click("기록 목록으로 돌아가기");
  await until(() => document.activeElement.textContent.includes("프로필 만들기"));
  check("editor back returns focus to its opener", true);
  await page.eval(() => document.querySelector('[data-drawer-close]').click());
  await click("자료 연결"); await click("폴더 연결");
  await until(() => document.querySelector('[data-folder-tree-root]'));
  await page.eval(() => document.querySelector('[data-drawer-close]').click());
  await click("자료 · 검증 자료 A");
  await until(() => document.activeElement.hasAttribute("data-folder-tree-root"));
  await until(() => !document.getElementById("conversation-materials").open);
  check("desktop sources focus the existing tree without a second drawer", await page.eval(() => !document.getElementById("conversation-materials").open));
  await fill("#message-draft", "합성 자료"); await click("보내기");
  await until(() => document.querySelector('[data-document-find]'));
  await page.eval(() => {
    const select = document.querySelector('[aria-label="찾을 달"]');
    select.value = "all"; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  check("scope has two visible radio controls and search is last", await page.eval(() => { const form = document.querySelector('[data-document-find] form'); const inputs = [...form.querySelectorAll("input, select, button")]; return form.querySelectorAll('input[type="radio"]').length === 2 && inputs.at(-1).hasAttribute("data-find-search"); }));
  await click("검색 시작");
  await until(() => document.querySelector('[data-find-results] li'));
  check("evidence is folded while match status remains visible", await page.eval(() => [...document.querySelectorAll('[data-find-candidate]')].every(node => node.querySelector('details:not([open])') && node.textContent.includes("조건 일치"))));
  await page.screenshot({ path: resolve(output, "search-1440.png"), format: "png" });
  await page.eval(() => { const select = document.querySelector('[aria-label="대화 작업"]'); select.value = "chat"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.eval(() => document.querySelector('[data-fixture-view="files"]').click());
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await until(() => document.querySelector('[aria-label="대화 작업"]')?.value === "chat");
  check("file navigation preserves the explicitly chosen task", true);
  await fill("#message-draft", "2026년 계획을 알려줘");
  await click("보내기");
  await until(() => window.conversationFixtureStore.getSnapshot().turns.at(-1)?.question === "2026년 계획을 알려줘");
  check("switching from find to chat does not reinterpret a new question as search conditions", await page.eval(() => !window.conversationFixtureStore.getSnapshot().turns.at(-1).kind || window.conversationFixtureStore.getSnapshot().turns.at(-1).kind === "chat"));
  await until(() => !window.conversationFixtureStore.getSnapshot().active);
  for (const width of [1920, 390]) {
    await page.setViewport({ width, height: 900 });
    check(`${width}: no document overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `search-${width}.png`), format: "png" });
  }
  await fill("#message-draft", "조합 중");
  const before = await page.eval(() => document.querySelectorAll('[aria-label="나의 메시지"]').length);
  await page.eval(() => {
    const input = document.getElementById("message-draft");
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true }));
  });
  check("Korean IME Enter does not submit", await page.eval(() => document.querySelectorAll('[aria-label="나의 메시지"]').length) === before);
  await page.eval(() => document.getElementById("message-draft").dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await click("설정"); await click("사용 방법 다시 보기");
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  check("narrow tour fits the screen", await page.eval(() => { const r = document.querySelector('#workspace-tour-title').parentElement.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
  await page.screenshot({ path: resolve(output, "tour-390.png"), format: "png" });
  await click("건너뛰기");
  await page.eval(() => document.querySelector('[data-fixture-guide-dirty]').click());
  await page.eval(() => document.querySelector('[data-fixture-guide-replay]').click());
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  await click("다음");
  await until(() => document.querySelector('[aria-label="검증용 이탈 확인"]') && !document.querySelector('dialog:modal'));
  check("guide pauses so an inline unsaved-navigation confirmation is operable", await page.eval(() => !document.querySelector('[aria-label="검증용 이탈 확인"]').closest('[inert]')));
  await page.eval(() => [...document.querySelectorAll('a[href="/settings"]')].find(link => link.checkVisibility()).click());
  check("a second route request keeps the current leave confirmation", await page.eval(() => !!document.querySelector('[aria-label="검증용 이탈 확인"]') && !document.querySelector('dialog:modal')));
  await click("검증용 계속 편집");
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  check("cancelling the navigation resumes the same guide step", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("1 / 9")));
  await click("다음");
  await until(() => document.querySelector('[aria-label="검증용 이탈 확인"]') && !document.querySelector('dialog:modal'));
  await page.eval(() => [...document.querySelectorAll('a[href="/settings"]')].find(link => link.checkVisibility()).click());
  await click("검증용 이동");
  await until(() => document.querySelector('dialog:modal').textContent.includes("2 / 9"));
  check("confirming navigation resumes the requested guide step", await page.eval(() => location.pathname === "/files"));
  await click("건너뛰기");
  await until(() => !document.querySelector('dialog:modal'));
  await page.eval(() => localStorage.removeItem("fixture:guide:organization-A"));
  await page.goto(url + "&guideDelay", { settleMs: 350 });
  await until(() => typeof window.resolveFixtureGuide === "function");
  await page.eval(() => document.querySelector('[data-fixture-guide-replay]').click());
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  await click("다음");
  await until(() => document.querySelector('dialog:modal').textContent.includes("2 / 9"));
  await page.eval(() => window.resolveFixtureGuide());
  await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check("a late first-use claim does not restart a manually opened guide", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("2 / 9")));
  await click("건너뛰기");
  await until(() => !document.querySelector('dialog:modal'));
  console.log(JSON.stringify({ passed: checks.length, output }));
} catch (error) {
  console.error(await page?.eval(() => ({ path: location.pathname, openDialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.getAttribute('aria-label') || node.getAttribute('aria-labelledby')), quickMenu: !!document.querySelector('[data-quick-switch-menu]'), scopes: [...document.querySelectorAll('[data-workspace-quick-menu]')].map(node => node.checkVisibility()), blockers: [...document.querySelectorAll('[data-navigation-loading],[data-quick-switch-block]')].filter(node => node.checkVisibility()).map(node => node.tagName) })).catch(() => null));
  await page?.screenshot({ path: resolve(output, "failure.png"), format: "png" }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(resolve(output, "checks.json"), JSON.stringify(checks, null, 2));
  await browser.close(); await server.close();
}
