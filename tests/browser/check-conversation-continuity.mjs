import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? ".omx/verification/conversation-continuity");
mkdirSync(output, { recursive: true });
let generations = 0;
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error",
  cacheDir: resolve(".omx/browser-cache/conversation-continuity"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { dedupe: ["react", "react-dom"], alias: {
    "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
    "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"),
    "@personal-ai/domain": resolve("packages/domain/src/index.ts"),
  } },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"] },
  plugins: [{ name: "conversation-continuity", configureServer(vite) {
    vite.middlewares.use("/__continuity", (_req, res) => {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>');
    });
    vite.middlewares.use("/api/chat", async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      generations++;
      if (input.messages.at(-1).content === "합성 실패") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end('{"code":"provider"}');
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      res.write(`data: ${JSON.stringify({ generationId: input.requestId, sequence: 0, type: "accepted" })}\n\n`);
      // The client must stop this synthetic response; no provider is contacted.
      req.once("close", () => res.end());
    });
  } }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
const checks = [];
let page;
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
const until = async predicate => {
  for (let n = 0; n < 600; n++) {
    if (await page.eval(predicate)) return;
    await new Promise(done => setTimeout(done, 25));
  }
  throw Error("Continuity timeout: " + predicate);
};
const select = async value => page.eval(value => {
  const input = document.querySelector('select[aria-label="대화 작업"]');
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, value);
const submit = async text => {
  await page.eval(() => { const input = document.getElementById("message-draft"); input.focus(); input.select(); });
  await page.send("Input.insertText", { text });
  await page.eval(() => document.querySelector('[data-action="organization-send"]').click());
};
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__continuity?transfer`;
  await page.goto(url, { settleMs: 400 });
  await until(() => !!document.querySelector('[data-tour="task-find"]'));
  await page.eval(() => document.querySelector('[data-tour="task-find"]').click());
  await page.eval(async () => { await listingProbe.prepare(); });
  await page.eval(() => document.querySelector('[data-conversation-context] button:first-child').click());
  await until(() => !!document.querySelector('[aria-label="자료 폴더 연결"] button:not(:disabled)'));
  await page.eval(() => document.querySelector('[aria-label="자료 폴더 연결"] button:not(:disabled)').click());
  await until(() => !!document.querySelector('[data-folder-tree-root]'));
  await page.eval(() => document.querySelector('[data-drawer-close]').click());
  await select("organize");
  await submit("합성 자료 정리해줘");
  await until(() => !!document.querySelector("[data-local-preparation]"));
  await until(() => !document.querySelector('select[aria-label="대화 작업"]').disabled);
  check("U1: selecting organize uses organization guidance and keeps the finder closed", await page.eval(() =>
    document.querySelector('select[aria-label="대화 작업"]').value === "organize"
    && !document.querySelector("[data-document-find]") && document.body.textContent.includes("정리할 자료의 범위를 확인해 주세요.")));
  await select("find");
  await submit("합성 자료 찾아줘");
  await until(() => !!document.querySelector("[data-find-search]"));
  await page.eval(() => { listingProbe.holdRead = true; document.querySelector("[data-find-search]").click(); });
  await until(() => document.querySelector('select[aria-label="대화 작업"]').disabled);
  await select("organize");
  check("U2: reading blocks mode changes without replacing the selected mode", await page.eval(() => conversationFixtureStore.getSelection().mode === "find"));
  await page.eval(() => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "작업 대기 중지").click());
  await page.eval(() => { listingProbe.holdRead = false; listingProbe.holds.splice(0).forEach(done => done()); });
  await until(() => !document.querySelector('select[aria-label="대화 작업"]').disabled);
  await select("chat");
  await submit("합성 대기");
  await until(() => document.querySelector('select[aria-label="대화 작업"]').disabled);
  check("U2: a streamed response blocks the mode selector", true);
  await page.eval(() => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "답변 중지").click());
  await until(() => !document.querySelector('select[aria-label="대화 작업"]').disabled);
  await submit("합성 실패");
  await until(() => !document.querySelector('select[aria-label="대화 작업"]').disabled && conversationFixtureStore.getSnapshot().turns.at(-1)?.status === "error");
  await select("organize");
  check("U2: cancellation and failure both allow the next mode", await page.eval(() => conversationFixtureStore.getSelection().mode === "organize"));
  await page.eval(() => { const input = document.getElementById("message-draft"); input.focus(); });
  await page.send("Input.insertText", { text: "보존할 합성 초안" });
  await page.eval(() => document.querySelector('[data-fixture-view="files"]').click());
  await page.eval(() => document.querySelector('[data-fixture-view="chat"]').click());
  await until(() => !!document.getElementById("message-draft"));
  check("U3: same-document navigation preserves temporary transcript and draft without replay", generations === 2 && await page.eval(() =>
    document.body.textContent.includes("합성 자료 정리해줘") && document.getElementById("message-draft").value.includes("보존할 합성 초안")));
  check("source work does not write original files or call the organization provider", await page.eval(() => listingProbe.productWrites === 0 && liveTransferProbe.calls.length === 0));
  for (const width of [390, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: continuity controls do not overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/continuity-${width}.png`, format: "png" });
  }
  await page.send("Page.reload");
  await until(() => !!document.querySelector('[data-tour="task-find"]'));
  check("U3: refresh starts a temporary chat without automatic storage or generation", generations === 2 && await page.eval(() =>
    conversationFixtureStore.getSnapshot().turns.length === 0 && conversationFixtureStore.getSnapshot().draft === ""));
  console.log(`${checks.length} continuity checks passed.`);
} finally {
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, generations, text: page ? await page.eval(() => document.body.innerText) : "", errors: page?.consoleErrors, condition: "Synthetic OPFS and HTTP stream; real product UI/controllers; saved record reopening is verified by check-ai-records." }, null, 2));
  await browser.close();
  await server.close();
}
