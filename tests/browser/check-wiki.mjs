import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? ".omx/verification/ocr-wiki/wiki");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: resolve("apps/web"), logLevel: "error", cacheDir: resolve(".omx/browser-cache/wiki"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("apps/web/tests/browser-fixtures/grounded-navigation.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"] },
  plugins: [{ name: "wiki-fixture", configureServer(server) { server.middlewares.use("/__wiki", (_request, response) => { response.setHeader("content-type", "text/html; charset=utf-8"); response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/grounded-chat.tsx"></script></html>'); }); } }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
const checks = [];
let page;
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { for (let n = 0; n < 600; n++) { if (await page.eval(`Boolean((${predicate.toString()})())`)) return; await pause(30); } throw Error("Wiki fixture timeout: " + predicate); }
async function click(text) {
  await page.eval(text => {
    const root = document.querySelector("dialog[open]") ?? document;
    const node = [...root.querySelectorAll("button")].find(node => node.checkVisibility() && (node.textContent.trim() === text || node.querySelector(":scope > span")?.textContent === text || node.querySelector("strong")?.textContent === text));
    if (!node || node.disabled) throw Error("Missing enabled button: " + text);
    node.click();
  }, text);
}
async function fill(selector, value) {
  await page.eval(selector => { const node = document.querySelector(selector); node.focus(); node.select(); }, selector);
  await page.send("Input.insertText", { text: value });
}
async function prepare() {
  await page.eval(() => document.querySelector("[data-grounded-prepare]").click());
  await until(() => document.querySelector('[data-grounded-prepare][data-ready="ready"]'));
}
async function send(question) {
  await fill("#message-draft", question);
  await until(() => document.querySelector('[aria-label="선택 자료 전송 확인"] input'));
  await page.eval(() => document.querySelector('[aria-label="선택 자료 전송 확인"] input').click());
  await page.eval(() => document.querySelector('[data-action="organization-send"]').click());
  await until(() => document.querySelector('[aria-label="자료 근거 답변"]'));
}
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__wiki`;
  await page.goto(url, { settleMs: 800 });
  await until(() => document.querySelector('[data-grounded-connect]:not(:disabled)'));
  await page.eval(async () => {
    await listingProbe.prepare(); listingProbe.preparing = true;
    const stream = await (await listingProbe.a.getFileHandle("evidence.md", { create: true })).createWritable();
    await stream.write("검증 가능한 합성 원본 자료입니다. 위키 출처와 편집 보존을 확인합니다."); await stream.close();
    listingProbe.preparing = false;
  });
  await page.eval(() => document.querySelector("[data-grounded-connect]").click());
  await until(() => document.body.innerText.includes("검증 자료 A"));
  await page.eval(() => [...document.querySelectorAll('[data-conversation-context] button')].find(button => button.textContent === "저장 안 함").click());
  await page.eval(() => { window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle("wiki-library", { create: true }); });
  await click("저장 폴더 선택");
  await until(() => document.body.innerText.includes("wiki-library"));
  await until(() => [...document.querySelectorAll("button")].some(button => button.textContent === "이 대화 저장" && !button.disabled));
  await page.eval(() => document.querySelector("[data-drawer-close]").click());
  await until(() => !document.querySelector("dialog[open]"));
  await prepare();
  await send("자료를 요약해 주세요. 위키 검증");
  await click("위키로 저장");
  await until(() => document.body.innerText.includes("출처가 연결된 위키 초안"));
  check("verified grounded answer creates a separate wiki without another model call", await page.eval(() => groundedProbe.calls.length === 1));
  await click("기록함"); await click("위키"); await click("자료를 요약해 주세요. 위키 검증");
  await until(() => document.querySelector('[aria-label="위키 출처"]')?.textContent.includes("원본과 근거가 일치"));
  check("wiki restores structured citations and model provenance", await page.eval(() => document.querySelector('[aria-label="위키 출처"]').textContent.includes("evidence.md") && document.querySelector('[aria-label="위키 출처"]').textContent.includes("fixture-only")));
  await fill('[aria-label="기록 편집"] textarea[data-document]', "사용자가 편집한 위키 본문입니다.");
  check("user text is distinguished from the AI draft and blocks quick navigation", await page.eval(() => document.querySelector('[aria-label="기록 편집"]').hasAttribute("data-quick-switch-block") && document.querySelector('[aria-label="기록 편집"]').textContent.includes("사용자가 편집한 본문")));
  await page.eval(async () => { listingProbe.preparing = true; const stream = await (await listingProbe.a.getFileHandle("evidence.md")).createWritable(); await stream.write("외부에서 바뀐 자료입니다. 현재 위키와 다릅니다."); await stream.close(); listingProbe.preparing = false; });
  await click("출처 다시 확인");
  await until(() => document.querySelector('[aria-label="위키 출처"]')?.textContent.includes("갱신 필요"));
  check("source mutation marks needs-update without replacing user edits", await page.eval(() => document.querySelector('[aria-label="기록 편집"] textarea').value === "사용자가 편집한 위키 본문입니다."));
  await click("저장"); await until(() => document.body.innerText.includes("로컬 폴더에 저장했습니다"));
  await click("목록으로"); await page.eval(() => document.querySelector("[data-drawer-close]").click());
  await until(() => !document.querySelector("dialog[open]"));
  await prepare();
  await page.eval(() => { groundedProbe.answer = "변경된 자료를 확인한 새 위키 초안입니다."; });
  await send("자료를 요약해 주세요. 새 위키 초안");
  await page.eval(() => { const select = document.querySelector('[aria-label="위키 저장 대상"]'); select.value = select.options[1].value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await click("위키에 새 초안 제안");
  await until(() => document.body.innerText.includes("기존 본문은 유지합니다"));
  await click("기록함"); await click("위키"); await click("자료를 요약해 주세요. 위키 검증");
  await until(() => document.querySelector('[aria-label="위키 새 초안 검토"]'));
  check("new generation remains a proposal until explicit acceptance", await page.eval(() => document.querySelector('[aria-label="기록 편집"] textarea').value === "사용자가 편집한 위키 본문입니다." && document.querySelector('[aria-label="위키 새 초안 검토"]').textContent.includes("변경된 자료")));
  await until(() => [...document.querySelectorAll("button")].some(button => button.textContent === "새 초안 반영" && !button.disabled));
  check("new proposal checks its own changed source snapshot", await page.eval(() => document.querySelector('[aria-label="위키 출처"]').textContent.includes("새 초안 출처와 생성 기록") && document.querySelector('[aria-label="위키 출처"]').textContent.includes("원본과 근거가 일치")));
  await click("새 초안 반영");
  check("explicit acceptance changes the generation version and draft text", await page.eval(() => document.querySelector('[aria-label="기록 편집"] textarea').value === "변경된 자료를 확인한 새 위키 초안입니다." && document.querySelector('[aria-label="위키 출처"]').textContent.includes("생성 버전 2")));
  await click("저장"); await until(() => document.body.innerText.includes("로컬 폴더에 저장했습니다"));
  check("prior generated and edited versions remain available", await page.eval(() => document.querySelector('[aria-label="기록 편집"] select option') && [...document.querySelectorAll('[aria-label="기록 편집"] select')].some(select => select.options.length >= 5)));
  await click("evidence.md 원문 열기");
  await until(() => document.querySelector('[aria-label="문서 본문"]')?.textContent.includes("외부에서 바뀐 자료"));
  check("source opens through the shared verified preview without leaving the editor", await page.eval(() => document.querySelector('[aria-label="기록 편집"] textarea').value === "변경된 자료를 확인한 새 위키 초안입니다."));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(`wiki editor remains within viewport ${width}`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector("dialog[open]").scrollWidth <= document.querySelector("dialog[open]").clientWidth));
    await page.screenshot({ path: resolve(output, `wiki-${width}.png`), format: "png" });
    if (width === 390 || width === 1440) {
      await page.eval(() => document.querySelector('[aria-label="위키 출처"]').scrollIntoView({ block: "start" }));
      await page.screenshot({ path: resolve(output, `wiki-sources-${width}.png`), format: "png" });
    }
  }
  await page.goto(url, { settleMs: 800 });
  await click("기록함"); await click("위키"); await click("자료를 요약해 주세요. 위키 검증");
  await until(() => document.querySelector('[aria-label="기록 편집"] textarea')?.value.includes("변경된 자료"));
  check("reload restores the wiki without regenerating an answer", await page.eval(() => groundedProbe.calls.length === 0));
  await page.eval(() => document.querySelector('[data-drawer-close]').click());
  await until(() => !document.querySelector("dialog[open]"));
  await page.eval(() => document.querySelector('[data-grounded-owner]').click());
  await until(() => document.getElementById("message-draft"));
  await click("기록함"); await click("위키");
  check("another owner does not see the prior wiki", !await page.eval(() => document.body.innerText.includes("자료를 요약해 주세요. 위키 검증")));
  check("wiki workflow has no browser exception", page.consoleErrors.length === 0);
  writeFileSync(resolve(output, "checks.json"), JSON.stringify({ checks, condition: "Actual product UI/repository/revisions/hash Worker and isolated OPFS; synthetic grounded action and permissions; no real account, native picker, model call or personal source." }, null, 2));
  console.log(`${checks.length} wiki workflow checks passed.`);
} catch (error) {
  writeFileSync(resolve(output, "failure.json"), JSON.stringify({ checks, error: String(error), consoleErrors: page?.consoleErrors, text: page ? await page.eval(() => document.body.innerText) : "" }, null, 2));
  throw error;
} finally { await browser.close(); await server.close(); }
