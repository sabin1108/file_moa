import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? ".omx/verification/local-rag-20261115/browser");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error", cacheDir: resolve(".omx/browser-cache/local-rag"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { dedupe: ["react", "react-dom"], alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  oxc: { jsx: { runtime: "automatic" } }, optimizeDeps: { entries: ["tests/browser-fixtures/local-rag-search.tsx"], include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "zod", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"] },
  plugins: [{ name: "local-rag-check", configureServer(server) { server.middlewares.use("/__rag", (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-rag-search.tsx"></script></html>');
  }); } }],
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
const checks = [];
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let page;
const until = async expression => {
  for (let i = 0; i < 700; i++) { if (await page.eval(`Boolean(${expression})`)) return; await pause(25); }
  throw Error("Timed out: " + expression);
};
const click = async text => page.eval(text => { const buttons = [...document.querySelectorAll("button")].filter(button => button.textContent.trim() === text); assertOne(buttons); buttons[0].click(); function assertOne(nodes) { if (nodes.length !== 1) throw Error("Ambiguous button: " + text + " " + nodes.length); } }, text);
const submit = async question => {
  await page.eval(() => { const input = document.getElementById("message-draft"); input.focus(); input.select(); });
  await page.send("Input.insertText", { text: question });
  await page.eval(() => document.querySelector('[data-action="organization-send"]').click());
  await until("document.querySelector('[data-find-search]')");
};

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(origin + "/__rag", { settleMs: 350 });
  await until('window.ragProbe?.local?.state.phase === "ready"');
  await page.eval(async () => {
    const p = window.listingProbe;
    p.preparing = true;
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("로컬 RAG 합성 자료", { create: true });
    const corpus = [
      { path: ["가온센터 이력서.md"], text: "가온센터 이력서 양식과 지원 경험" },
      { path: ["가온센터", "지원 메모.md"], text: "지원 준비 기록" },
      { path: ["다른센터 이력서.md"], text: "다른센터 이력서 양식" },
      { path: ["가온센터 계약서.docx"], text: "읽지 않을 합성 본문" },
      { path: ["개발", "Next.js 로그인.md"], text: "로그인 오류! 해결과 쿠키 만료" },
      { path: ["개발", "Next.js 로그인 초안.md"], text: "로그인 오류! 초안!" },
      { path: ["연구!", "Next.js 메모.md"], text: "로그인 오류! 해결" },
      { path: [".NET ERR_AUTH.md"], text: "인증 코드와 토큰 검증" },
      { path: ["garbled.md"], text: new Uint8Array([255]) },
    ];
    for (const entry of corpus) {
      let directory = root;
      for (const part of entry.path.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
      const stream = await (await directory.getFileHandle(entry.path.at(-1), { create: true })).createWritable();
      await stream.write(entry.text); await stream.close();
    }
    window.ragRoot = root;
    window.showDirectoryPicker = async () => root;
    window.workerReads = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...args) { if (message?.file instanceof File) window.workerReads.push(message.file.name); return post.call(this, message, ...args); };
    p.preparing = false; p.productWrites = 0;
  });
  await page.eval(() => document.querySelector("[data-rag-connect]").click());
  await until('window.ragProbe.local.state.view?.status === "connected"');
  await page.eval(() => document.querySelector("[data-rag-settings]").click());
  await until('document.querySelector("[data-search-index-settings]")');
  await page.eval(() => { document.querySelector("[data-search-index-settings]").open = true; });
  await click("파일 목록 갱신");
  await until('document.querySelector("[data-search-index-settings]").textContent.includes("목록 9개")');
  check("metadata refresh stores unsupported files without invoking the extraction Worker", await page.eval(() => window.workerReads.length === 0));
  check("settings shows real catalog/body counts", await page.eval(() => document.querySelector("[data-search-index-settings]").textContent.includes("본문 0개")));
  await page.eval(async () => {
    const { LocalTextIndex } = await import("/src/features/local-folders/search/documents/local-text-index.ts");
    const local = window.ragProbe.local;
    window.ragIndex = new LocalTextIndex();
    window.ragScope = { owner: local.owner.userId, workspace: local.owner.workspaceId, connection: local.sources.find(source => source.active).connectionId };
  });
  check("catalog keeps DOCX as metadata-only", await page.eval(async () => (await window.ragIndex.catalog(window.ragScope)).some(file => file.path.at(-1).endsWith(".docx") && file.status === "unsupported")));
  const partial = await page.eval(async () => { window.listingProbe.failRead = "NotReadableError"; return window.ragProbe.local.refreshSourceIndex(new AbortController().signal); });
  check("partial scan preserves the previous complete catalog", !partial.complete && partial.catalogCount === 9);

  await page.eval(() => { window.listingProbe.holdRead = true; window.heldRefresh = window.ragProbe.local.refreshSourceIndex(new AbortController().signal).then(() => "finished", error => error.message); });
  await until("window.listingProbe.holds.length > 0");
  const race = await page.eval(async () => {
    const clear = window.ragProbe.local.clearSourceIndex();
    window.listingProbe.holdRead = false;
    window.listingProbe.holds.splice(0).forEach(release => release());
    const refresh = await window.heldRefresh;
    await clear;
    return { refresh, status: await window.ragProbe.local.readSourceIndexStatus() };
  });
  check("refresh followed by clear cannot repopulate a cleared catalog", race.refresh === "stale-connection-operation" && race.status.catalogCount === 0 && race.status.textCount === 0);
  await page.eval(async () => {
    const clear = window.ragProbe.local.clearSourceIndex().catch(error => error.message);
    const refresh = window.ragProbe.local.refreshSourceIndex(new AbortController().signal);
    await clear;
    await refresh;
  });
  check("clear followed by a new refresh keeps the latest catalog", await page.eval(async () => (await window.ragProbe.local.readSourceIndexStatus()).catalogCount === 9));
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: index settings fit the viewport`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `settings-${width}.png`), format: "png" });
  }
  await page.setViewport({ width: 1440, height: 1000 });

  await page.eval(() => document.querySelector("[data-rag-settings]").click());
  await page.eval(() => document.querySelector('[data-tour="task-find"]').click());
  await submit("가온센터 이력서 찾아줘");
  await page.eval(() => document.querySelector("[data-find-search]").click());
  await until('window.ragProbe.local.finding.getSnapshot().phase === "ready"');
  check("named target stays mandatory while document type remains a preference", await page.eval(() => {
    const result = window.ragProbe.local.finding.getSnapshot().result;
    return result.documents.length === 3 && result.documents.every(document => document.path.join("/").includes("가온센터")) && result.documents.some(document => document.finding.relevance?.kind === "related");
  }));
  check("related results are explained without a full-condition badge", await page.eval(() => [...document.querySelectorAll("[data-find-related]")].every(node => !node.parentElement.textContent.includes("✓ 조건 일치"))));
  check("metadata-only files cannot be selected for grounded preparation", await page.eval(() => { const inputs = [...document.querySelectorAll('[data-find-metadata="true"] input')]; return inputs.length === 1 && inputs.every(input => input.disabled); }));
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900 });
    check(`${width}: query conditions and results stay within the viewport`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `query-${width}.png`), format: "png" });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.eval(() => { document.querySelector("[data-document-find] details").open = true; document.querySelector("[data-remote-query]").open = true; });
  check("remote interpretation is disabled before explicit question consent", await page.eval(() => [...document.querySelectorAll("[data-remote-query] button")].find(button => button.textContent.includes("질문만")).disabled && window.ragProbe.requests.length === 0));
  await page.eval(() => document.querySelector('[data-remote-query] input[type="checkbox"]').click());
  await click("질문만 보내 조건 제안 받기");
  await until('[...document.querySelectorAll("button")].some(button => button.textContent === "이 조건으로 적용")');
  check("interpretation payload contains no document/index/history data", await page.eval(() => window.ragProbe.requests.every(request => Object.keys(request).sort().join(",") === "consent,owner,question,requestId")));
  const reads = await page.eval(() => window.workerReads.length);
  await page.eval(() => { const input = document.querySelector('[aria-label="선호 검색어"]'); input.focus(); input.select(); });
  await page.send("Input.insertText", { text: "지원" });
  check("edited filters cannot apply a stale remote proposal", await page.eval(() => [...document.querySelectorAll("button")].find(button => button.textContent === "이 조건으로 적용").disabled));
  await page.eval(() => { const input = document.querySelector('[aria-label="선호 검색어"]'); input.focus(); input.select(); });
  await page.send("Input.insertText", { text: "이력서" });
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: expanded conditions and question consent fit the viewport`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `conditions-${width}.png`), format: "png" });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await click("이 조건으로 적용");
  check("applying a proposal does not start local reads or AI answering", await page.eval(() => window.workerReads.length) === reads);
  await page.eval(() => { window.ragProbe.mode = "hold"; document.querySelector('[data-remote-query] input[type="checkbox"]').click(); });
  await click("질문만 보내 조건 제안 받기");
  await until("window.ragProbe.release !== null");
  await click("응답 대기 취소");
  await page.eval(() => { window.ragProbe.release(); window.ragProbe.release = null; });
  check("late model response after cancel never becomes an applied proposal", await page.eval(() => ![...document.querySelectorAll("button")].some(button => button.textContent === "이 조건으로 적용")));

  await submit('Next.js "로그인 오류!" -"초안!" path:"연구!" 찾아줘');
  await page.eval(() => document.querySelector("[data-find-search]").click());
  await until('window.ragProbe.local.finding.getSnapshot().phase === "ready"');
  check("phrase punctuation, exclusions and path filter survive real Worker execution", await page.eval(() => {
    const docs = window.ragProbe.local.finding.getSnapshot().result.documents;
    return docs.length === 1 && docs[0].path.join("/") === "연구!/Next.js 메모.md";
  }));
  check("metadata prefilter avoids reading files outside explicit path", await page.eval(reads => window.workerReads.slice(reads).every(name => !name.includes("가온센터")), reads));

  const second = await browser.newPage({ width: 900, height: 800 });
  await second.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  await second.goto(origin + "/__rag", { settleMs: 350 });
  for (let i = 0; i < 300 && !await second.eval(() => window.ragProbe?.local?.state.view?.status === "connected"); i++) await pause(25);
  check("second tab restores the same owner connection", await second.eval(() => window.ragProbe.local.state.view?.status === "connected"));
  await page.eval(async () => { const local = window.ragProbe.local; await local.disconnectSource(local.sources.find(source => source.active).connectionId); });
  const stale = await second.eval(async () => { try { await window.ragProbe.local.refreshSourceIndex(new AbortController().signal); return "unexpected-success"; } catch (error) { return error.message; } });
  check("a disconnected second-tab handle cannot recreate a cleared index", stale === "source-folder-not-connected" && await page.eval(async () => (await window.ragIndex.status(window.ragScope)).catalogCount === 0));
  check("source files receive no product writes", await page.eval(() => window.listingProbe.productWrites === 0));
  check("browser reports no product exceptions", page.consoleErrors.length === 0 && second.consoleErrors.length === 0);
  writeFileSync(resolve(output, "checks.json"), JSON.stringify({ checks, condition: "Actual UI/controllers/Worker/hash/IDB/OPFS/Web Locks; synthetic folder permissions and model response. Real OS permission dialog, physical IME/device and paid service authorization are separate." }, null, 2));
  console.log(`${checks.length} local RAG browser checks passed.`);
} catch (error) {
  writeFileSync(resolve(output, "failure.json"), JSON.stringify({ checks, error: String(error), stack: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); await server.close(); }
