import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? "docs/verification/workspace-nine/browser");
mkdirSync(output, { recursive: true });
let generations = 0;
const server = await createServer({ configFile: false, root: resolve("apps/web"), logLevel: "error", cacheDir: resolve(".omx/browser-cache/records"), server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } }, resolve: { alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } }, oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"] }, plugins: [{ name: "records-fixture", configureServer(server) {
  server.middlewares.use("/__records", (_request, response) => { response.setHeader("content-type", "text/html; charset=utf-8"); response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>'); });
  server.middlewares.use("/api/chat", async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); generations++;
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of [{ type: "accepted" }, { type: "text_delta", text: "저장할 합성 답변입니다." }, { type: "completed", model: "fixture", usage: null }]) response.write(`data: ${JSON.stringify({ generationId: input.requestId, sequence: ["accepted", "text_delta", "completed"].indexOf(event.type), ...event })}\n\n`);
    response.end();
  });
} }] });
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
const checks = [];
let page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass) => { checks.push({ name, pass: !!pass }); assert.ok(pass, name); };
async function until(predicate, argument) {
  for (let i = 0; i < 1000; i++) { if (await page.eval(`(async () => Boolean(await (${predicate.toString()})(${JSON.stringify(argument)})))()`)) return; await pause(30); }
  throw new Error("Timeout: " + predicate);
}
async function click(text) {
  await page.eval(text => { const button = [...document.querySelectorAll("button")].find(node => (node.textContent.trim() === text || node.querySelector("strong")?.textContent === text || node.querySelector(":scope > span")?.textContent === text) && node.getClientRects().length); if (!button || button.disabled) throw new Error("Missing control " + text); button.focus(); button.click(); }, text);
}
async function fill(selector, text) {
  await until(selector => { const node = document.querySelector(selector); return node && (!document.querySelector('dialog:modal') || node.closest('dialog:modal')); }, selector);
  await page.eval(selector => { const node = document.querySelector(selector); node.focus(); node.select(); }, selector);
  await page.send("Input.insertText", { text });
  assert.equal(await page.eval(selector => document.querySelector(selector).value, selector), text, "Text must reach the intended input");
}
async function closeLibrary() { await page.eval(() => document.querySelector('[data-drawer-close]').click()); }
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('내 AI 검증',{create:true});};` });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__records?general`;
  await page.goto(url, { settleMs: 500 });
  await until(() => document.getElementById("message-draft"));
  check("composer shows three controls and no inline settings essay", await page.eval(() => document.querySelectorAll('[data-conversation-context] button').length === 3 && !document.getElementById('message-draft').closest('form').querySelector('details')));
  await page.screenshot({ path: resolve(output, "chat-1440.png"), format: "png" });
  await click("저장 안 함");
  await click("저장 폴더 선택");
  await until(() => document.body.innerText.includes("내 AI 검증"));
  await until(() => [...document.querySelectorAll("button")].some(button => button.textContent === "이 대화 저장" && !button.disabled));
  await click("이 대화 저장");
  await closeLibrary();
  await fill("#message-draft", "기록 검증 질문");
  await click("보내기");
  await until(() => document.querySelector('[data-conversation-context]').textContent.includes("저장됨"));
  check("completed chat is saved after verified file close", generations === 1 && await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다.")));
  await page.eval(() => document.querySelector('[data-fixture-view="files"]').click());
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await until(() => document.getElementById("message-draft"));
  check("file navigation retains the active saved conversation and storage mode", generations === 1 && await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다.") && document.querySelector('[data-conversation-context]').textContent.includes("저장됨")));
  await fill("#message-draft", "왕복 뒤 같은 대화에 저장할 초안");
  const savedAfterNavigation = async () => {
    try {
    const { AiRecordRepository } = await import("/src/features/ai-records/services/ai-record-repository.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() {} }));
    const records = (await repository.list()).filter(record => record.payload.type === "conversation");
      return records.length === 1 && records[0].payload.draft === "왕복 뒤 같은 대화에 저장할 초안";
    } catch { return false; }
  };
  await until(savedAfterNavigation);
  check("post-navigation autosave updates one conversation instead of creating a duplicate", await page.eval(savedAfterNavigation));
  await click("기록함");
  await click("새 대화");
  check("new chat clears the current thread without generating", await page.eval(() => !document.body.innerText.includes("저장할 합성 답변입니다.")) && generations === 1);
  await click("기록함");
  await click("기록 검증 질문");
  check("saved chat restores text without replay", await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다.")) && generations === 1);
  await click("결과물로 편집");
  await until(() => document.body.innerText.includes("초안을 자동 저장했습니다."));
  await closeLibrary();
  await until(() => document.activeElement?.textContent === "결과물로 편집");
  check("closing an answer editor returns focus to the answer action", await page.eval(() => document.activeElement.textContent === "결과물로 편집"));
  await click("기록함");
  await fill("textarea[data-document]", "편집한 결과물 본문");
  await click("저장");
  await until(() => document.body.innerText.includes("로컬 폴더에 저장했습니다."));
  check("artifact can be edited and versioned", await page.eval(() => document.querySelectorAll('[aria-label="기록 편집"] option').length >= 3));
  await click("목록으로");
  await click("기억");
  await click("새 기억");
  await fill('[aria-label="기록 편집"] textarea', "짧고 구체적인 답변을 선호함");
  await click("설정");
  check("settings disclose advanced policy without displaying the whole essay", await page.eval(() => [...document.querySelectorAll('details')].filter(node => node.getClientRects().length && !node.closest('[hidden]')).every(node => !node.open) && !!document.querySelector('[aria-label="대화 설정"]')));
  await page.screenshot({ path: resolve(output, "settings-1440.png"), format: "png" });
  await click("기록");
  check("switching tools preserves the unfinished editor", await page.eval(() => document.querySelector('[aria-label="기록 편집"] textarea').value === "짧고 구체적인 답변을 선호함"));
  await click("목록으로");
  check("leaving an unsaved memory still requires an explicit discard", await page.eval(() => !!document.querySelector('[aria-label="기록 편집"] [role="alert"]')));
  await click("계속 편집");
  await click("저장");
  await until(() => document.body.innerText.includes("로컬 폴더에 저장했습니다."));
  check("new memory remains proposed until explicit approval", await page.eval(() => document.querySelector('[aria-label="기록 편집"] select').value === "proposed"));
  await click("목록으로");
  await fill('input[aria-label="저장 기록 검색"]', "찾을 수 없는 제목");
  check("record title search filters the list locally", await page.eval(() => document.body.innerText.includes("검색 결과가 없어요") && !document.querySelector('[aria-label="저장 기록"] li')) && generations === 1);
  await fill('input[aria-label="저장 기록 검색"]', "");
  await page.eval(() => document.querySelector('[aria-label="새 기억 관리"]').click());
  await click("삭제");
  check("contextual delete presents a focused explicit confirmation", await page.eval(() => document.activeElement === document.querySelector('[aria-label="기록 삭제 확인"] h3') && document.body.innerText.includes("저장한 모든 버전이 삭제됩니다")));
  await click("취소");
  await until(() => document.activeElement?.getAttribute('aria-label') === '새 기억 관리');
  check("cancelling deletion restores focus and leaves the record", await page.eval(() => !!document.querySelector('[aria-label="새 기억 관리"]')));
  await closeLibrary();
  await page.setViewport({ width: 390, height: 844 });
  await click("기록함");
  check("narrow record drawer fits viewport", await page.eval(() => document.querySelector('dialog').getBoundingClientRect().width <= innerWidth && document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(output, "records-390.png"), format: "png" });
  await page.eval(() => document.querySelector('[aria-label="새 기억 관리"]').click());
  await click("삭제"); await click("모든 버전 삭제");
  await until(() => document.activeElement === document.querySelector('[aria-label="저장 기록"] h3'));
  check("successful delete returns focus to the surviving list heading", await page.eval(() => !document.querySelector('[aria-label="새 기억 관리"]')));
  await closeLibrary();
  await page.goto(url, { settleMs: 700 });
  await click("기록함");
  await until(() => document.body.innerText.includes("기록 검증 질문"));
  await click("기록 검증 질문");
  check("reload restores directory records without another model request", generations === 1 && await page.eval(() => document.body.innerText.includes("저장할 합성 답변입니다.")));
  await page.eval(async () => {
    const { AiRecordRepository } = await import("/src/features/ai-records/services/ai-record-repository.ts");
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle("내 AI 검증");
    const repository = new AiRecordRepository(async () => ({ directory, owner: { userId: "organization-A", workspaceId: "fixture" }, assertCurrent() {} }));
    for (const count of [100, 500]) {
      const answer = "긴 대화의 읽기와 입력을 확인하는 합성 문장입니다. ".repeat(6);
      await repository.save({ id: `chat-long-${count}`, type: "conversation", title: `긴 대화 ${count}`, updatedAt: new Date().toISOString(), draft: "", projectId: null, turns: Array.from({ length: count }, (_, index) => ({ id: `turn-${index}`, question: `합성 질문 ${index}`, answer, visibleLength: answer.length, status: "completed" })) }, null);
    }
  });
  await click("기록함"); await click("저장 위치"); await click("권한 확인·다시 읽기"); await click("기록으로");
  await until(() => document.body.innerText.includes("긴 대화 500"));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.send("Performance.enable");
  const heapBefore = (await page.send("Performance.getMetrics")).metrics.find(metric => metric.name === "JSHeapUsedSize")?.value;
  const longSamples = [];
  for (let run = 0; run < 3; run++) for (const count of [100, 500]) {
    if (run || count === 500) await click("기록함");
    const elapsedMs = await page.eval(async title => {
      const start = performance.now();
      [...document.querySelectorAll('[aria-label="저장 기록"] button')].find(button => button.querySelector('strong')?.textContent === title).click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - start;
    }, `긴 대화 ${count}`);
    await until(count => document.querySelectorAll('[aria-label="대화 내용"] article').length === count * 2, count);
    const heapBytes = (await page.send("Performance.getMetrics")).metrics.find(metric => metric.name === "JSHeapUsedSize")?.value;
    longSamples.push({ run, turns: count, elapsedMs: Math.round(elapsedMs * 10) / 10, heapBytes });
  }
  check("100 and 500 saved turns restore without truncation or another model call", generations === 1 && longSamples.length === 6);
  check("repeated transcript opens retain exactly the current DOM and expose six heap samples", Number.isFinite(heapBefore) && longSamples.every(sample => Number.isFinite(sample.heapBytes)) && await page.eval(() => document.querySelectorAll('[aria-label="대화 내용"] article').length === 1000));
  await page.setViewport({ width: 390, height: 844 });
  await fill("#message-draft", "긴 대화에서도 보존할 초안");
  await page.eval(() => { const input = document.getElementById("message-draft"); input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8, text: "\r" });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
  check("500-turn narrow chat keeps keyboard newline and fits the viewport", await page.eval(() => document.getElementById("message-draft").value.includes("\n") && document.documentElement.scrollWidth <= innerWidth) && generations === 1);
  writeFileSync(resolve(output, "long-conversation.json"), JSON.stringify({ heapBefore, samples: longSamples, condition: "Isolated Chromium 1440px, actual product repository and OPFS, 100/500 synthetic saved turns, three alternating opens measured through two animation frames; followed by 390px keyboard newline. Heap is CDP JSHeapUsedSize with uncontrolled GC, not browser RSS or a leak proof. DOM equals the current turn count rather than accumulating previous opens. Timing measures already-loaded transcript rendering, not disk startup, field INP, live model speed or a stable percentile." }, null, 2));
  await click("기록함");
  await click("저장 위치");
  await click("저장 없이 새 대화");
  await fill("#message-draft", "지속 저장하지 않을 임시 내용");
  await pause(2200);
  await click("기록함");
  check("temporary draft is absent from saved conversation list", !await page.eval(() => [...document.querySelectorAll('[aria-label="저장 기록"] button')].some(button => button.textContent.includes("지속 저장하지 않을 임시 내용"))));
  await page.screenshot({ path: resolve(output, "records-1440.png"), format: "png" });
  await click("저장 위치");
  await click("기록으로");
  await until(() => document.activeElement?.textContent === "저장 위치");
  check("returning from storage focuses its visible entry control", await page.eval(() => document.activeElement.textContent === "저장 위치"));
  await click("저장 위치");
  await page.eval(async () => {
    const { FolderConnectionSession } = await import('/src/features/local-folders/services/connection-session.ts');
    const original = FolderConnectionSession.prototype.disconnect;
    FolderConnectionSession.prototype.disconnect = async function (kind) { FolderConnectionSession.prototype.disconnect = original; throw new Error('fixture-disconnect-failure'); };
  });
  await click("연결 해제");
  await until(() => document.querySelector('[aria-label="기록 저장 위치"]').textContent.includes("저장을 마치지 못했어요"));
  check("failed disconnect retains the temporary draft and stops storage", await page.eval(() => document.getElementById('message-draft').value === "지속 저장하지 않을 임시 내용" && document.querySelector('[data-conversation-context]').textContent.includes('저장 안 함')));
  await click("저장 폴더 선택");
  await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === '연결 해제' && !button.disabled));
  await click("연결 해제");
  await until(() => document.querySelector('[aria-label="기록 저장 위치"] h3').textContent === '대화를 보관할 폴더' && [...document.querySelectorAll('button')].some(button => button.textContent === '저장 폴더 선택' && !button.disabled));
  check("successful disconnect keeps the current conversation temporary", await page.eval(() => document.getElementById('message-draft').value === "지속 저장하지 않을 임시 내용" && !document.querySelector('[aria-label="기록 저장 위치"] h3').textContent.includes('내 AI 검증')));
  await closeLibrary();
  await page.eval(async () => { await listingProbe.prepare(); window.showDirectoryPicker = async () => listingProbe.name === "검증 자료 A" ? listingProbe.a : listingProbe.b; document.querySelector('[data-fixture-view="settings"]').click(); });
  await until(() => document.querySelector('[aria-label="자료 폴더 연결 설정"]'));
  await click("폴더 연결");
  await until(() => document.body.innerText.includes("검증 자료 A"));
  await page.eval(() => { listingProbe.name = "검증 자료 B"; });
  await click("다른 폴더 선택");
  await until(() => document.querySelector('[aria-label="연결된 자료 폴더 목록"]'));
  check("multiple source references remain independently listed", await page.eval(() => { const text = document.querySelector('[aria-label="연결된 자료 폴더 목록"]').textContent; return text.includes("검증 자료 A") && text.includes("검증 자료 B (사용 중)"); }));
  await page.eval(() => [...document.querySelectorAll('[aria-label="연결된 자료 폴더 목록"] > div')].find(row => row.textContent.includes("검증 자료 A")).querySelector("button").click());
  await until(() => document.querySelector('[aria-label="연결된 자료 폴더 목록"]').textContent.includes("검증 자료 A (사용 중)"));
  check("source root switches without modifying originals", await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)));
  await page.eval(() => document.querySelector('[data-fixture-owner]').click());
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await until(() => document.getElementById("message-draft"));
  await click("기록함");
  check("another account sees neither saved records nor another owner's AI folder", !await page.eval(() => document.body.innerText.includes("기록 검증 질문") || document.body.innerText.includes("내 AI 검증")));
  check("record UI has no browser exceptions", page.consoleErrors.length === 0);
  writeFileSync(resolve(output, "records-checks.json"), JSON.stringify({ checks, generations, condition: "Actual product components/services with isolated OPFS and fixture SSE; no personal folders or paid model calls." }, null, 2));
  console.log(`${checks.length} AI record browser checks passed.`);
} catch (error) {
  writeFileSync(resolve(output, "records-failure.json"), JSON.stringify({ checks, error: String(error), consoleErrors: page?.consoleErrors, active: page ? await page.eval(() => document.activeElement?.outerHTML.slice(0, 800)) : "", text: page ? await page.eval(() => document.body.innerText) : "" }, null, 2));
  throw error;
} finally { await browser.close(); await server.close(); }
