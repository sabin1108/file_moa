import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? ".omx/verification/search-fields-20261114/browser");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error",
  cacheDir: resolve(".omx/browser-cache/search-fields"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"] },
  plugins: [{ name: "field-search", configureServer(server) {
    server.middlewares.use("/__fields", (_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-field-search.tsx"></script></html>');
    });
  } }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
const checks = [];
const timings = [];
const requests = [];
let page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, pass) => { checks.push({ name, pass: !!pass }); assert.ok(pass, name); };
async function until(predicate) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;
    await pause(30);
  }
  throw new Error("Timeout: " + predicate);
}
async function search(terms, filters = {}) {
  return page.eval(async ({ terms, filters }) => {
    const controller = window.fieldSearch.finding;
    controller.configure({ terms, month: "all", ...filters });
    const started = performance.now();
    await controller.search();
    const state = controller.getSnapshot();
    return { durationMs: performance.now() - started, phase: state.phase, result: state.result };
  }, { terms, filters });
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  browser.on(page.sessionId, "Network.requestWillBeSent", event => requests.push(event.request.url));
  await page.send("Network.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__fields`, { settleMs: 350 });
  await until(() => window.fieldSearch?.state.phase === "ready");
  await page.eval(async () => {
    const probe = window.listingProbe;
    probe.preparing = true;
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("분야 검색 검증", { create: true });
    window.searchCorpus = [
      { path: ["도담센터 연구보고.md"], text: "업무 메모" },
      { path: ["도담센터", "노트.md"], text: "연구보고 본문" },
      { path: ["본문만.md"], text: "도담센터 연구보고" },
      { path: ["다른회사 연구보고.md"], text: "다른회사 연구보고" },
      { path: ["도담센터 연구보고.docx"], text: "본문을 읽으면 안 되는 합성 미지원 파일" },
      { path: ["도담센터 연구보고 깨짐.md"], invalid: true },
      { path: ["Next.js 로그인.md"], text: "인증 처리 예제" },
      { path: ["C++ 메모.md"], text: "스레드 메모" },
      { path: [".NET 인증.md"], text: "서버 예제" },
      { path: ["도담센터 연구보고 2026-10-15.md"], text: "날짜를 기록하지 않은 설명" },
      { path: ["작성일 안쪽.md"], text: "도담센터 연구보고\n작성일: 2026-10-15" },
      { path: ["작성일 바깥.md"], text: "도담센터 연구보고\n작성일: 2026-11-15" },
      { path: ["도담센터 연구보고 " + "긴 이름 ".repeat(10) + ".md"], text: "긴 이름 합성 자료" },
    ];
    for (const entry of window.searchCorpus) {
      let folder = root;
      for (const part of entry.path.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
      const stream = await (await folder.getFileHandle(entry.path.at(-1), { create: true })).createWritable();
      await stream.write(entry.invalid ? new Uint8Array([255]) : entry.text);
      await stream.close();
    }
    window.searchRoot = root;
    window.showDirectoryPicker = async () => root;
    window.workerReads = [];
    const originalPost = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...args) {
      if (message?.file instanceof File) window.workerReads.push(message.file.name);
      return originalPost.call(this, message, ...args);
    };
    probe.preparing = false;
    probe.productWrites = 0;
  });
  await page.eval(() => document.querySelector('[data-search-connect]').click());
  await until(() => window.fieldSearch.state.view?.status === "connected");
  await page.eval(() => document.querySelector('[data-tour="task-find"]').click());
  await page.eval(() => document.getElementById("message-draft").focus());
  await page.send("Input.insertText", { text: "도담센터 연구보고 찾아줘" });
  await page.eval(() => document.querySelector('[data-action="organization-send"]').click());
  await until(() => document.querySelector('[data-find-search]'));
  const first = await search("도담센터 연구보고");
  timings.push({ condition: "cold Worker and cache", ms: first.durationMs });
  const paths = first.result.documents.map(document => document.path.join("/"));
  check("filename, folder, body and metadata-only candidates are all reachable", first.phase === "ready" && paths.length === 9 && paths.includes("도담센터/노트.md") && paths.includes("본문만.md") && paths.includes("도담센터 연구보고.docx"));
  check("another company is not included just because the document type matches", !paths.includes("다른회사 연구보고.md"));
  check("metadata-only files are never posted to the extraction Worker", !await page.eval(() => window.workerReads.some(name => name.endsWith(".docx"))));
  check("actual Worker records distributed name and body evidence", first.result.documents.find(document => document.path.join("/") === "도담센터/노트.md").finding.matches.path.includes("도담센터"));
  check("name matches rank ahead of body-only matches", paths.indexOf("도담센터 연구보고.md") < paths.indexOf("본문만.md"));
  await until(() => document.querySelectorAll('[data-find-candidate]').length === 9);
  check("metadata-only rows explain and disable both selection and preview", await page.eval(() => document.querySelectorAll('[data-find-metadata]').length === 2 && [...document.querySelectorAll('[data-find-metadata]')].every(node => node.textContent.includes("본문 미확인 · 선택 불가") && !node.textContent.includes("✓ 조건 일치") && node.querySelector('input[type="checkbox"]').disabled && [...node.querySelectorAll('button')].every(button => button.disabled))));
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: fields and long names do not overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `fields-${width}.png`), format: "png" });
  }
  const warm = await search("도담센터 연구보고");
  timings.push({ condition: "warm same corpus", ms: warm.durationMs });
  check("cache reuse keeps the same ranked result", JSON.stringify(warm.result.documents) === JSON.stringify(first.result.documents));
  for (const [terms, expected] of [["Next.js 로그인", "Next.js 로그인.md"], ["C++ 스레드", "C++ 메모.md"], [".NET 인증", ".NET 인증.md"]]) {
    const result = await search(terms);
    check(`technical identifiers remain distinct: ${terms}`, result.result.documents.length === 1 && result.result.documents[0].name === expected);
  }
  const dated = await search("도담센터 연구보고", { month: "10", year: "2026", basis: "body", window: "month" });
  check("filename dates do not become body dates", dated.result.documents.find(document => document.name === "도담센터 연구보고 2026-10-15.md").finding.kind === "date-unknown");
  check("confirmed out-of-period body dates are excluded", !dated.result.documents.some(document => document.name === "작성일 바깥.md"));
  await page.eval(() => window.fieldSearch.finding.setScope(["도담센터"]));
  const scoped = await search("도담센터 연구보고");
  check("folder scope cannot expand back to the root", scoped.result.documents.length === 1 && scoped.result.documents[0].path.join("/") === "도담센터/노트.md");
  await page.eval(async () => {
    window.fieldSearch.finding.setScope(null);
    listingProbe.preparing = true;
    const stream = await (await window.searchRoot.getFileHandle("본문만.md")).createWritable();
    await stream.write("기존 검색어가 없는 새 본문");
    await stream.close();
    listingProbe.preparing = false;
  });
  const changed = await search("도담센터 연구보고");
  check("changed source content cannot reuse an old body hit from the cache", !changed.result.documents.some(document => document.name === "본문만.md"));
  await page.eval(() => {
    listingProbe.holdRead = true;
    window.pendingFieldSearch = window.fieldSearch.finding.search();
  });
  await until(() => listingProbe.holds.length > 0);
  await page.eval(async () => {
    window.fieldSearch.finding.cancel();
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(resolve => resolve());
    await window.pendingFieldSearch;
  });
  check("cancelled scans cannot publish late metadata or body results", await page.eval(() => window.fieldSearch.finding.getSnapshot().phase === "cancelled" && !window.fieldSearch.finding.getSnapshot().result));
  await page.eval(() => { listingProbe.permission = "denied"; });
  const revoked = await search("도담센터 연구보고");
  check("permission loss clears results and requires reconnect instead of returning metadata-only success", revoked.phase !== "ready" && revoked.result === null && await page.eval(() => window.fieldSearch.state.view?.status !== "connected" && document.body.innerText.includes("다시 연결")));
  check("search never writes source files", await page.eval(() => listingProbe.productWrites === 0));
  check("search never calls a model endpoint", !requests.some(url => /\/api\/chat|openai\.com|generativelanguage\.googleapis\.com/.test(url)));
  writeFileSync(resolve(output, "checks.json"), JSON.stringify({ checks, timings, corpusFiles: 13, condition: "actual local controllers/Worker/hash/IndexedDB and synthetic OPFS/permission; no personal corpus or live model" }, null, 2));
  console.log(`${checks.length} field search browser checks passed.`);
} catch (error) {
  writeFileSync(resolve(output, "failure.json"), JSON.stringify({ checks, error: String(error), text: page ? await page.eval(() => document.body.innerText) : "", consoleErrors: page?.consoleErrors }, null, 2));
  throw error;
} finally {
  await browser.close();
  await server.close();
}
