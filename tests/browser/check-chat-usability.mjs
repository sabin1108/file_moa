import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";
import { workspaceTourSteps } from "../../apps/web/src/features/onboarding/workspace-tour-steps.ts";

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

async function waitGuideStep(index) {
  await until(step => {
    const dialog = document.querySelector('dialog:modal[aria-labelledby="workspace-tour-title"]');
    const target = [...document.querySelectorAll(step.selector)].find(node => node.checkVisibility());
    const spot = dialog?.querySelector('[aria-hidden="true"]');
    if (!target || !spot || dialog.querySelector("h2").textContent !== step.title || dialog.getAttribute("aria-busy") !== "false") return false;
    const a = target.getBoundingClientRect(), b = spot.getBoundingClientRect();
    return Math.abs(b.top - Math.max(4, a.top - 4)) < 1 && Math.abs(b.left - Math.max(4, a.left - 4)) < 1 && Math.abs(b.right - Math.min(innerWidth - 4, a.right + 4)) < 1 && Math.abs(b.bottom - Math.min(innerHeight - 4, a.bottom + 4)) < 1 && !dialog.getAnimations({ subtree: true }).some(animation => animation.playState === "running");
  }, workspaceTourSteps[index]);
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
  check("tour supports previous and next", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("1 / 17")));
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
  const explainedTasks = [], explainedRecords = [];
  await page.eval(() => {
    window.guideCloseCalls = 0;
    document.querySelector('dialog[aria-labelledby="workspace-tour-title"]').addEventListener("close", () => window.guideCloseCalls++);
  });
  for (let step = 0; step < 16; step++) {
    await click("다음");
    await until(() => ![...document.querySelectorAll('dialog:modal button')].find(button => button.textContent === "다음" || button.textContent === "완료")?.disabled);
    await until(() => document.querySelector('dialog:modal [aria-hidden="true"]')?.getBoundingClientRect().width > 0);
    await waitGuideStep(step + 1);
    check(`guide step ${step + 2} highlights its actual control`, true);
    check(`guide step ${step + 2} leaves its target uncovered`, await page.eval(() => {
      const dialog = document.querySelector('dialog:modal[aria-labelledby="workspace-tour-title"]');
      const a = dialog.querySelector("section").getBoundingClientRect(), b = dialog.querySelector('[aria-hidden="true"]').getBoundingClientRect();
      return Math.min(a.right, b.right) <= Math.max(a.left, b.left) || Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top);
    }));
    const detail = await page.eval(() => ({ title: document.querySelector('#workspace-tour-title').textContent, record: document.querySelector('#conversation-materials[open] [aria-label="보관 기록 종류"] button[aria-pressed="true"]')?.getAttribute('data-tour') }));
    if (step >= 2 && step <= 5) explainedTasks.push(detail.title.split(" · ")[0]);
    if (step >= 8 && step <= 12) explainedRecords.push(detail.record);
  }
  check("all four tasks have their own usage guidance", JSON.stringify(explainedTasks) === JSON.stringify(["일반 대화", "자료 찾기", "자료로 질문", "자료 정리"]));
  check("all five record tabs are actually revealed without creating a record", JSON.stringify(explainedRecords) === JSON.stringify(["record-conversation", "record-artifact", "record-wiki", "record-memory", "record-profile"]));
  check("ordinary guide transitions keep the same native dialog open", await page.eval(() => window.guideCloseCalls === 0));
  await click("완료");
  await until(() => !document.querySelector('dialog:modal'));
  check("guide route changes keep history length and do not invoke the folder picker", await page.eval(expected => history.length === expected.history && window.pickerCalls === expected.pickers, { history: historyBeforeGuide, pickers: pickerBeforeGuide }));
  await page.eval(() => window.dispatchEvent(new CustomEvent("fixture-navigation", { detail: { href: "/settings?tab=controls", replace: false } })));
  await until(() => document.querySelector('a[href="/?guide=1"]'));
  await page.eval(() => document.querySelector('a[href="/?guide=1"]').click());
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  check("settings replay link opens the guide without remounting the workspace layout", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("1 / 17") && location.pathname === "/" && !location.search.includes("guide=1")));
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
  check("evidence is folded while full or related match status remains visible", await page.eval(() => [...document.querySelectorAll('[data-find-candidate]')].every(node => node.querySelector('details:not([open])') && (node.textContent.includes("조건 일치") || node.querySelector('[data-find-related]')))));
  await page.screenshot({ path: resolve(output, "search-1440.png"), format: "png" });
  await page.eval(() => { document.querySelector('[data-document-find] > details').open = true; });
  await fill('[aria-label="본문 검색어"]', "없는합성키워드");
  await click("검색 시작");
  await until(() => document.querySelector('[data-find-results] [role="status"]'));
  check("empty search has a single next-action message instead of repeated zero counts", await page.eval(() => document.querySelector('[data-find-results]').textContent.includes("확인한 자료에서는 찾지 못했어요") && !document.querySelector('[data-find-results]').textContent.includes("날짜 확인 필요 0")));
  await page.screenshot({ path: resolve(output, "search-empty-1440.png"), format: "png" });
  await click("검색어 바꾸기");
  await fill('[aria-label="본문 검색어"]', "합성 자료");
  await click("검색 시작");
  await until(() => document.querySelector('[data-find-candidate] input'));
  await page.eval(() => document.querySelector('[data-find-candidate] input').click());
  await click("선택한 자료로 질문");
  await until(() => document.querySelector('[data-grounded-preparation] summary'));
  check("search selections lead directly to question preparation while preserving the request", await page.eval(() => document.querySelector('[aria-label="대화 작업"]').value === "grounded" && document.getElementById('message-draft').value === "합성 자료"));
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
  check("cancelling the navigation resumes the same guide step", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("1 / 17")));
  await click("다음");
  await until(() => document.querySelector('[aria-label="검증용 이탈 확인"]') && !document.querySelector('dialog:modal'));
  await page.eval(() => [...document.querySelectorAll('a[href="/settings"]')].find(link => link.checkVisibility()).click());
  await click("검증용 이동");
  await until(() => document.querySelector('dialog:modal').textContent.includes("2 / 17"));
  check("confirming navigation resumes the requested guide step", await page.eval(() => location.pathname === "/files"));
  await click("건너뛰기");
  await until(() => !document.querySelector('dialog:modal'));
  await page.eval(() => localStorage.removeItem("fixture:guide:organization-A"));
  await page.goto(url + "&guideDelay", { settleMs: 350 });
  await until(() => typeof window.resolveFixtureGuide === "function");
  await page.eval(() => document.querySelector('[data-fixture-guide-replay]').click());
  await until(() => document.querySelector('dialog:modal #workspace-tour-title'));
  await click("다음");
  await until(() => document.querySelector('dialog:modal').textContent.includes("2 / 17"));
  await page.eval(() => window.resolveFixtureGuide());
  await page.eval(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check("a late first-use claim does not restart a manually opened guide", await page.eval(() => document.querySelector('dialog:modal').textContent.includes("2 / 17")));
  await click("건너뛰기");
  await until(() => !document.querySelector('dialog:modal'));
  const matrix = [];
  for (const { width, reduced } of [{ width: 1440, reduced: false }, { width: 768, reduced: false }, { width: 390, reduced: false }, { width: 390, reduced: true }]) {
    await page.setViewport({ width, height: width === 768 ? 1024 : 700 });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] });
    await page.goto(url, { settleMs: 350 });
    await page.eval(() => document.querySelector('[data-fixture-guide-replay]').click());
    for (let index = 0; index < workspaceTourSteps.length; index++) {
      const started = performance.now();
      await waitGuideStep(index);
      const geometry = await page.eval(() => {
        const dialog = document.querySelector('dialog:modal[aria-labelledby="workspace-tour-title"]');
        const a = dialog.querySelector("section").getBoundingClientRect(), b = dialog.querySelector('[aria-hidden="true"]').getBoundingClientRect();
        const actionsVisible = [...dialog.querySelectorAll("button")].every(button => { const r = button.getBoundingClientRect(); return r.top >= a.top && r.bottom <= a.bottom && r.left >= a.left && r.right <= a.right; });
        return { title: dialog.querySelector("h2").textContent, clear: Math.min(a.right, b.right) <= Math.max(a.left, b.left) || Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top), inViewport: a.left >= 0 && a.top >= 0 && a.right <= innerWidth && a.bottom <= innerHeight, actionsVisible, recordPreviewModal: document.querySelector('#conversation-materials')?.matches(':modal') ?? false, transition: getComputedStyle(dialog.querySelector('[aria-hidden="true"]')).transitionDuration, taskTarget: [...document.querySelectorAll('[data-tour^="task-"]')].some(node => node.checkVisibility()), cardHeight: a.height };
      });
      check(`${width}${reduced ? " reduced" : ""}: step ${index + 1} is readable without covering its target`, geometry.clear && geometry.inViewport && geometry.actionsVisible && !geometry.recordPreviewModal);
      assert.equal(await page.eval(() => document.querySelector('[data-tour-copy]').scrollTop), 0, "Each explanation starts at its title");
      if (index >= 3 && index <= 6) assert.ok(geometry.taskTarget, "Initial task buttons remain available without selecting a mode");
      if (reduced) assert.equal(geometry.transition, "0s");
      matrix.push({ width, reduced, step: index + 1, settledMs: performance.now() - started, ...geometry });
      if (!reduced && [4, 12, 16].includes(index)) await page.screenshot({ path: resolve(output, `guide-${width}-${index + 1}.png`), format: "png" });
      await page.eval(() => { const copy = document.querySelector('[data-tour-copy]'); copy.scrollTop = copy.scrollHeight; });
      await click(index === workspaceTourSteps.length - 1 ? "완료" : "다음");
    }
    await until(() => !document.querySelector('dialog:modal'));
    check(`${width}${reduced ? " reduced" : ""}: guide does not choose a conversation task`, await page.eval(() => !document.getElementById('message-draft') && !!document.querySelector('[data-tour="task-chat"]')));
  }
  writeFileSync(resolve(output, "tour-matrix.json"), JSON.stringify(matrix, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output }));
} catch (error) {
  console.error(await page?.eval(steps => {
    const title = document.querySelector('#workspace-tour-title')?.textContent;
    const step = steps.find(step => step.title === title);
    const rect = node => { const r = node?.getBoundingClientRect(); return r ? { top: r.top, left: r.left, right: r.right, bottom: r.bottom } : null; };
    const spot = document.querySelector('dialog:modal [aria-hidden="true"]');
    return { title, target: rect(step && [...document.querySelectorAll(step.selector)].find(node => node.checkVisibility())), spotlight: rect(spot), style: spot?.getAttribute('style'), transition: spot && getComputedStyle(spot).transition, animations: spot?.getAnimations().map(a => ({ state: a.playState, time: a.currentTime })), scroll: { x: scrollX, y: scrollY }, card: rect(document.querySelector('dialog:modal section')) };
  }, workspaceTourSteps).catch(() => null));
  console.error(await page?.eval(() => ({ path: location.pathname, openDialogs: [...document.querySelectorAll('dialog[open]')].map(node => node.getAttribute('aria-label') || node.getAttribute('aria-labelledby')), quickMenu: !!document.querySelector('[data-quick-switch-menu]'), scopes: [...document.querySelectorAll('[data-workspace-quick-menu]')].map(node => node.checkVisibility()), blockers: [...document.querySelectorAll('[data-navigation-loading],[data-quick-switch-block]')].filter(node => node.checkVisibility()).map(node => node.tagName) })).catch(() => null));
  await page?.screenshot({ path: resolve(output, "failure.png"), format: "png" }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(resolve(output, "checks.json"), JSON.stringify(checks, null, 2));
  await browser.close(); await server.close();
}
