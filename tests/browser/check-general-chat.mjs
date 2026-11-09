import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";
import { probe, layout, app } from "../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs";
import { judge, judgeLayout, judgeApp, APP_SKIP } from "../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = process.argv[2] ?? "docs/verification/general-chat/browser";
mkdirSync(output, { recursive: true });
const requests = [];
const burstText = "실제로 도착한 본문을 부드럽게 표시합니다. ".repeat(20);
let closed = 0;
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error", cacheDir: resolve(".omx/browser-cache/general-chat"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{ name: "general-chat-fixture", configureServer(server) {
    server.middlewares.use("/__chat", (_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>');
    });
    server.middlewares.use("/api/chat", async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      requests.push(input);
      const question = input.messages.at(-1).content;
      if (question === "한도") { response.writeHead(429, { "content-type": "application/json" }); response.end('{"code":"limit"}'); return; }
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      let sequence = 0;
      const send = event => response.write(`data: ${JSON.stringify({ generationId: input.requestId, sequence: sequence++, ...event })}\n\n`);
      send({ type: "accepted" });
      const timers = [];
      const later = (ms, callback) => timers.push(setTimeout(callback, ms));
      if (["묶음 응답", "묶음 세션 만료", "즉시 완료 묶음"].includes(question)) {
        later(100, () => send({ type: "text_delta", text: burstText }));
        later(question === "묶음 세션 만료" ? 140 : question === "즉시 완료 묶음" ? 105 : 700, () => {
          send(question === "묶음 세션 만료" ? { type: "error", code: "session" } : { type: "completed", model: "fixture-model", usage: null });
          response.end();
        });
        response.once("close", () => { closed++; timers.forEach(clearTimeout); });
        return;
      }
      later(100, () => send({ type: "text_delta", text: "먼저 받은 답변입니다.\n" }));
      if (question === "잘못된 순서") later(300, () => { send({ type: "text_delta", sequence: 9, text: "표시하면 안 됨" }); response.end(); });
      else if (question === "단절") later(300, () => response.end());
      else if (question !== "중지" && question !== "계정 전환") {
        later(700, () => send({ type: "text_delta", text: "이어서 완성했습니다." }));
        later(1400, () => { send({ type: "completed", model: "fixture-model", usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 } }); response.end(); });
      }
      response.once("close", () => { closed++; timers.forEach(clearTimeout); });
    });
  } }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] });
const checks = [];
const taste = [];
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let page;
async function until(predicate) {
  for (let index = 0; index < 400; index++) { if (await page.eval(`Boolean((${predicate.toString()})())`)) return; await pause(30); }
  throw new Error("Chat fixture timeout: " + predicate);
}
async function clickText(text) {
  const point = await page.eval(text => {
    const node = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === text);
    if (!node || node.disabled) throw new Error("Unavailable control: " + text);
    node.scrollIntoView({ block: "center", behavior: "instant" });
    const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, text);
  for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
}
async function fill(text) {
  await page.eval(() => { const node = document.getElementById("message-draft"); node.focus(); node.select(); });
  await page.send("Input.insertText", { text });
}
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__chat?general`;
  await page.goto(url, { settleMs: 500 });
  await until(() => document.getElementById("message-draft"));
  check("unconnected folder does not prevent general chat", await page.eval(() => !document.getElementById("message-draft").readOnly));
  check("mount does not send a generation", requests.length === 0);
  await fill("유지할 초안");
  const focusMetrics = await page.eval(() => {
    const input = document.getElementById("message-draft");
    const outer = input.parentElement;
    return { inputOutlineStyle: getComputedStyle(input).outlineStyle, outerOutline: getComputedStyle(outer).outlineWidth, outerOutlineStyle: getComputedStyle(outer).outlineStyle, radius: getComputedStyle(outer).borderRadius, focused: document.activeElement === input };
  });
  writeFileSync(`${output}/focus-metrics.json`, JSON.stringify(focusMetrics, null, 2));
  check("composite input has a rounded outer focus ring instead of an inner rectangle", focusMetrics.inputOutlineStyle === "none" && focusMetrics.outerOutlineStyle === "solid" && parseFloat(focusMetrics.outerOutline) >= 2 && parseFloat(focusMetrics.radius) > 0);
  await page.screenshot({ path: `${output}/composer-focus-1440.png`, format: "png" });
  const scopeGeometry = await page.eval(() => {
    const form = document.getElementById("message-draft").closest("form");
    const context = form.querySelector('[data-conversation-context]');
    const input = document.getElementById("message-draft").parentElement;
    return { buttonTextLeft: input.getBoundingClientRect().left, contextLeft: context.getBoundingClientRect().left, inputGap: input.getBoundingClientRect().top - context.getBoundingClientRect().bottom, controls: context.querySelectorAll('button').length };
  });
  writeFileSync(`${output}/scope-geometry.json`, JSON.stringify(scopeGeometry, null, 2));
  check("three compact context controls align with the input and keep a readable gap", Math.abs(scopeGeometry.buttonTextLeft - scopeGeometry.contextLeft) < 1 && scopeGeometry.controls === 3 && scopeGeometry.inputGap >= 10);
  await page.eval(() => { window.sharedComposer = document.getElementById("message-draft"); });
  for (let index = 0; index < 10; index++) { await clickText("기록함"); await page.eval(() => document.querySelector('[data-drawer-close]').click()); }
  check("draft and one composer survive ten record panel toggles", await page.eval(() => document.getElementById("message-draft") === sharedComposer && sharedComposer.value === "유지할 초안"));
  await fill("한글 입력");
  await page.eval(() => {
    const node = document.getElementById("message-draft");
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true }));
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  check("composition Enter does not send", requests.length === 0);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8, text: "\r" });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
  check("Shift Enter preserves a newline without sending", await page.eval(() => document.getElementById("message-draft").value.includes("\n")) && requests.length === 0);
  await fill("합성 첫 질문");
  await clickText("보내기");
  await until(() => document.body.innerText.includes("먼저 받은 답변입니다."));
  check("text appears while the generation is still pending", await page.eval(() => [...document.querySelectorAll("button")].some(button => button.textContent === "답변 중지") && !document.body.innerText.includes("답변 완료")));
  check("only text and the selected owner/provider are sent", Object.keys(requests[0]).sort().join() === "messages,owner,provider,requestId" && requests[0].messages.length === 1);
  await page.screenshot({ path: `${output}/streaming-1440.png`, format: "png" });
  await until(() => document.body.innerText.includes("답변 완료"));
  check("complete response does not duplicate text", await page.eval(() => document.querySelector('[aria-label="모아의 답변"] p').textContent === "먼저 받은 답변입니다.\n이어서 완성했습니다."));
  await clickText("기록함"); await page.eval(() => document.querySelector('[data-drawer-close]').click());
  check("completed conversation survives material workflow round trip", await page.eval(() => document.body.innerText.includes("합성 첫 질문") && document.body.innerText.includes("이어서 완성했습니다.")));
  await fill("중지"); await clickText("보내기");
  await until(() => document.querySelectorAll('[aria-label="모아의 답변"]').length === 2);
  await clickText("답변 중지");
  await until(() => document.body.innerText.includes("답변을 중지했어요"));
  const stoppedCount = requests.length;
  await pause(300);
  check("stop aborts HTTP and preserves an incomplete answer without retry", requests.length === stoppedCount && closed >= 2 && await page.eval(() => document.body.innerText.includes("미완료 답변")));
  await fill("단절"); await clickText("보내기");
  await until(() => document.body.innerText.includes("응답 연결이 끊겼어요"));
  check("context excludes stopped turns", requests.at(-1).messages.map(message => message.content).includes("중지") === false);
  await fill("잘못된 순서"); await clickText("보내기");
  await until(() => document.querySelectorAll('[aria-label="나의 메시지"]').length === 4);
  await until(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("보내기")));
  check("invalid sequence is not rendered as text", await page.eval(() => !document.body.innerText.includes("표시하면 안 됨")));
  await fill("한도"); await clickText("보내기");
  await until(() => document.body.innerText.includes("AI 요청 한도에 도달"));
  check("limit error preserves unsent question for explicit resubmission", await page.eval(() => document.getElementById("message-draft").value === "한도"));
  await page.eval(() => { document.querySelector('[aria-label="대화 내용"]').scrollTo({ top: 0, behavior: "instant" }); });
  await pause(100);
  const readingBefore = await page.eval(() => document.querySelector('[aria-label="대화 내용"]').scrollTop);
  const readingMaximum = await page.eval(() => { const thread = document.querySelector('[aria-label="대화 내용"]'); return thread.scrollHeight - thread.clientHeight; });
  await clickText("기록함"); await page.eval(() => document.querySelector('[data-drawer-close]').click());
  await until(() => !document.querySelector('dialog[open]'));
  const readingAfter = await page.eval(() => document.querySelector('[aria-label="대화 내용"]').scrollTop);
  writeFileSync(`${output}/reading-position.json`, JSON.stringify({ before: readingBefore, after: readingAfter, maximum: readingMaximum }));
  check("reading position survives a record panel toggle", readingBefore + 100 < readingMaximum && Math.abs(readingAfter - readingBefore) < 1);
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await pause(150);
    check(`no horizontal overflow at ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.eval(() => document.querySelector('[data-fixture-view]')?.parentElement.setAttribute("hidden", ""));
    const metrics = await page.eval(probe);
    const geometry = await page.eval(layout);
    const appMetrics = await page.eval(app);
    const findings = [...judge(metrics, { width }), ...judgeLayout(geometry, { width })].filter(finding => !APP_SKIP.has(finding.id) && !["no-title", "small-title"].includes(finding.id));
    findings.push(...judgeApp(appMetrics, metrics, { width }));
    taste.push({ width, findings });
    await page.screenshot({ path: `${output}/result-${width}.png`, format: "png" });
    await page.eval(() => document.querySelector('[data-fixture-view]')?.parentElement.removeAttribute("hidden"));
  }
  await fill("계정 전환"); await clickText("보내기");
  await until(() => [...document.querySelectorAll("button")].some(button => button.textContent === "답변 중지"));
  await page.eval(async () => (await import('/src/shared/auth-session-events.ts')).revokeAuthScope());
  await until(() => !document.body.innerText.includes("합성 첫 질문"));
  check("auth revocation clears transcript and draft", await page.eval(() => document.getElementById("message-draft").value === ""));
  await page.eval(() => {
    window.revealFrames = [];
    window.revealObserver = new MutationObserver(() => {
      const text = document.querySelector('[aria-label="모아의 답변"] p')?.textContent ?? "";
      if (window.revealFrames.at(-1)?.length !== text.length) window.revealFrames.push({ time: performance.now(), length: text.length });
    });
    window.revealObserver.observe(document.querySelector('[aria-label="대화 내용"]'), { subtree: true, childList: true, characterData: true });
  });
  await fill("묶음 응답"); await clickText("보내기");
  await until(() => document.body.innerText.includes("답변 완료"));
  const frames = await page.eval(() => window.revealFrames);
  const positive = frames.filter(frame => frame.length > 0);
  check("received burst grows across frames and catches up without duplicate text", positive.length >= 3 && positive[0].length < burstText.length && positive.at(-1).length === burstText.length && positive.at(-1).time - positive[0].time < 900);
  writeFileSync(`${output}/reveal-frames.json`, JSON.stringify({ condition: "Synthetic single received burst; UI reveal timing only, not provider latency", frames }, null, 2));
  await fill("묶음 응답"); await clickText("보내기");
  await until(() => document.querySelectorAll('[aria-label="모아의 답변"]').length === 2);
  await clickText("답변 중지");
  const stoppedText = await page.eval(() => [...document.querySelectorAll('[aria-label="모아의 답변"] p')].at(-1).textContent);
  await pause(200);
  check("stop discards unrevealed burst and cancels late frames", stoppedText.length < burstText.length && await page.eval(() => [...document.querySelectorAll('[aria-label="모아의 답변"] p')].at(-1).textContent) === stoppedText);
  await fill("묶음 세션 만료"); await clickText("보내기");
  await until(() => [...document.querySelectorAll('[aria-label="모아의 답변"]')].length === 3 && ![...document.querySelectorAll("button")].some(button => button.textContent === "답변 중지"));
  const expiredText = await page.eval(() => [...document.querySelectorAll('[aria-label="모아의 답변"] p')].at(-1).textContent);
  await pause(200);
  check("session failure discards unrevealed burst and cancels late frames", expiredText.length < burstText.length && await page.eval(() => [...document.querySelectorAll('[aria-label="모아의 답변"] p')].at(-1).textContent) === expiredText);
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await page.eval(async () => { window.revealFrames = []; (await import('/src/shared/auth-session-events.ts')).revokeAuthScope(); });
  await fill("묶음 응답"); await clickText("보내기");
  await until(() => document.querySelector('[aria-label="모아의 답변"] p'));
  check("reduced motion immediately reveals the received burst", await page.eval(() => window.revealFrames.find(frame => frame.length > 0)?.length) === burstText.length);
  await page.eval(async () => (await import('/src/shared/auth-session-events.ts')).revokeAuthScope());
  await pause(200);
  check("revocation cancels reveal and clears burst text", await page.eval(() => !document.querySelector('[aria-label="모아의 답변"]')));
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await page.eval(() => { window.revealFrames = []; });
  await fill("즉시 완료 묶음"); await clickText("보내기");
  await until(() => document.querySelector('[aria-label="모아의 답변"] p'));
  await pause(100);
  check("completion waits for the received text to finish revealing instead of dumping the queue", await page.eval(() => !document.body.innerText.includes("답변 완료") && [...document.querySelectorAll("button")].some(button => button.textContent === "답변 중지")));
  await until(() => document.body.innerText.includes("답변 완료"));
  const completedFrames = await page.eval(() => window.revealFrames.filter(frame => frame.length > 0));
  check("immediate completion still shows several small frames with exact final text", completedFrames.length >= 8 && completedFrames.at(-1).length === burstText.length && completedFrames.every((frame, index) => index === 0 || frame.length - completedFrames[index - 1].length < burstText.length / 3));
  writeFileSync(`${output}/completion-reveal-frames.json`, JSON.stringify(completedFrames, null, 2));
  await page.eval(async () => (await import('/src/shared/auth-session-events.ts')).revokeAuthScope());
  await fill("즉시 완료 묶음"); await clickText("보내기");
  await until(() => document.querySelector('[aria-label="모아의 답변"] p'));
  await pause(50); await clickText("답변 중지");
  const terminalStopped = await page.eval(() => document.querySelector('[aria-label="모아의 답변"] p').textContent);
  await pause(750);
  check("stop cancels a completed transport whose visible text is still draining", terminalStopped.length < burstText.length && await page.eval(() => document.querySelector('[aria-label="모아의 답변"] p').textContent) === terminalStopped && await page.eval(() => !document.body.innerText.includes("답변 완료")));
  await page.eval(() => window.revealObserver.disconnect());
  check("general conversation performs no file reads, writes or permission requests", await page.eval(() => listingProbe.productBodyReads === 0 && listingProbe.productWrites === 0 && listingProbe.permissionRequests === 0));
  check("no browser component exceptions", page.consoleErrors.length === 0);
  const failures = taste.flatMap(value => value.findings).filter(finding => finding.level === "FAIL");
  check("app inspector has no failing findings", failures.length === 0);
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(url, { settleMs: 500 });
  await until(() => document.getElementById("message-draft"));
  await page.eval(async () => {
    window.integrationComposer = document.getElementById("message-draft");
    await listingProbe.prepare();
    listingProbe.preparing = true;
    try {
      const writer = await (await listingProbe.a.getFileHandle("private-source-sentinel.md", { create: true })).createWritable();
      await writer.write("합성 자료 PRIVATE_LOCAL_SENTINEL 원본 본문입니다.");
      await writer.close();
    } finally { listingProbe.preparing = false; }
  });
  await fill("통합 대화 첫 질문"); await clickText("보내기");
  await until(() => document.body.innerText.includes("답변 완료"));
  await clickText("자료 연결");
  await page.eval(() => document.querySelector('[aria-label="자료 폴더 연결"] button').click());
  await until(() => [...document.querySelectorAll('[aria-label="자료 폴더 연결"] button')].some(button => button.textContent === "다른 폴더 선택" && !button.disabled));
  await page.eval(() => document.querySelector('[data-drawer-close]').click());
  const beforeTools = requests.length;
  await fill("합성 자료 찾아줘"); await clickText("보내기");
  await until(() => document.querySelector('[data-document-find]'));
  await clickText("검색 시작");
  await until(() => document.querySelector('[data-find-results]')?.textContent.includes("private-source-sentinel.md"));
  check("ordinary chat and source search share the same transcript and input node", await page.eval(() => document.getElementById("message-draft") === integrationComposer && document.querySelectorAll('[data-conversation-workspace]').length === 1 && document.body.innerText.includes("통합 대화 첫 질문")));
  await fill("회의 자료를 찾아서 정리해줘"); await clickText("보내기");
  await until(() => document.querySelector('[data-request-intent-choice]'));
  check("ambiguous requests wait without model calls and offer ordinary chat", requests.length === beforeTools && await page.eval(() => [...document.querySelectorAll('[data-request-intent-choice] button')].some(button => button.textContent === "일반 대화")));
  await clickText("계속 작성");
  await fill("합성 자료를 정리해줘"); await clickText("보내기");
  await until(() => document.querySelector('[data-local-preparation]'));
  check("organization stays in one chat and waits for source scope and consent", requests.length === beforeTools && await page.eval(() => document.getElementById("message-draft") === integrationComposer && !document.querySelector('[data-action="live-organization-send"]:not(:disabled)')));
  await until(() => !document.getElementById("message-draft").readOnly && document.querySelector('[data-action="organization-send"]'));
  await fill("다음 일반 질문입니다"); await clickText("보내기");
  await until(() => [...document.querySelectorAll('button')].some(button => button.textContent === "답변 중지"));
  await until(() => ![...document.querySelectorAll('button')].some(button => button.textContent === "답변 중지"));
  check("ordinary model context never includes local task requests, source paths or excerpts", requests.length === beforeTools + 1 && !/PRIVATE_LOCAL_SENTINEL|private-source-sentinel|합성 자료|회의 자료/u.test(JSON.stringify(requests.at(-1))));
  check("source work never replaces the shared composer", await page.eval(() => document.getElementById("message-draft") === integrationComposer && document.querySelectorAll('#message-draft').length === 1));
  await page.eval(() => document.querySelector('[data-fixture-view="files"]').click());
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await until(() => document.getElementById("message-draft"));
  check("file navigation preserves both ordinary and material history without a replay", requests.length === beforeTools + 1 && await page.eval(() => document.body.innerText.includes("통합 대화 첫 질문") && document.body.innerText.includes("합성 자료 찾아줘") && document.body.innerText.includes("다음 일반 질문입니다")));
  check("unified conversation has no component exceptions", page.consoleErrors.length === 0);
  await page.screenshot({ path: `${output}/unified-1440.png`, format: "png" });
  await page.setViewport({ width: 390, height: 844 });
  check("combined ordinary and material history fits a narrow screen", await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${output}/unified-390.png`, format: "png" });
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, requestCount: requests.length, condition: "Actual product UI/hook/reducer/fetch/SSE in isolated Chromium; fixture HTTP stream and owner; no live provider, authenticated Next stream or physical IME claims" }, null, 2));
  writeFileSync(`${output}/taste.json`, JSON.stringify(taste, null, 2));
  console.log(`${checks.length} general chat browser checks passed.`);
} catch (error) {
  writeFileSync(`${output}/failure.json`, JSON.stringify({ checks, error: String(error), consoleErrors: page?.consoleErrors, text: page ? await page.eval(() => document.body.innerText) : "" }, null, 2));
  throw error;
} finally { await browser.close(); await server.close(); }
