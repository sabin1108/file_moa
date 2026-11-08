import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = process.argv[2] ?? "docs/verification/folder-workspace-height";
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: {
    "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
    "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"),
    "@personal-ai/domain": resolve("packages/domain/src/index.ts")
  } },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{ name: "workspace-height-fixture", configureServer(server) {
    server.middlewares.use("/__workspace-height", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>');
    });
  } }]
});
let browser, page;
const checks = [];
async function until(predicate) {
  for (let index = 0; index < 200; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error("Workspace fixture timed out");
}
async function click(selector) {
  const point = await page.eval(async selector => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const node = document.querySelector(selector);
    assertVisible(node);
    function assertVisible(node) { if (!node?.checkVisibility()) throw Error("Missing visible control: " + selector); }
    node.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const rect = node.getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    if (!node.contains(document.elementFromPoint(point.x, point.y))) throw Error("Obscured control: " + selector + " " + JSON.stringify({ point, hit: document.elementFromPoint(point.x, point.y)?.outerHTML }));
    return point;
  }, selector);
  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
}
async function measure(name, width) {
  await page.eval(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
    window.scrollTo(0, 0);
  });
  const geometry = await page.eval(() => {
    const workspace = document.querySelector('[data-workspace="live"]');
    const area = workspace.querySelector("main");
    const preview = workspace.querySelector('[aria-label="미리보기 영역"]');
    const current = workspace.querySelector('[aria-label="자료 폴더 탐색"]');
    const bottom = workspace.querySelector("footer").getBoundingClientRect().top;
    return {
      bottom, columnsBottom: area.getBoundingClientRect().bottom,
      previewBottom: preview.getBoundingClientRect().bottom,
      workspaceHeight: workspace.getBoundingClientRect().height, viewportHeight: innerHeight,
      areaWidth: area.getBoundingClientRect().width,
      availableWidth: area.parentElement.getBoundingClientRect().width,
      listingWidth: current.getBoundingClientRect().width,
      overflow: document.documentElement.scrollWidth > innerWidth,
      modal: !!document.querySelector('dialog[aria-label="문서 미리보기"]:modal')
    };
  });
  checks.push({ name, width, ...geometry });
  writeFileSync(`${output}/checks.json`, JSON.stringify(checks, null, 2));
  assert.ok(Math.abs(geometry.columnsBottom - geometry.bottom) <= 1, `${name} ${width}: work area ends ${geometry.bottom - geometry.columnsBottom}px above footer`);
  if (width >= 768) assert.ok(Math.abs(geometry.previewBottom - geometry.bottom) <= 1, "Desktop preview must fill the work area");
  assert.equal(geometry.overflow, false, "No horizontal overflow");
  assert.ok(Math.abs(geometry.areaWidth - geometry.availableWidth) <= 1, "Columns fill the available width");
  if (width < 768) assert.ok(Math.abs(geometry.listingWidth - width) <= 1, "Mobile list fills the screen width");
  assert.ok(geometry.workspaceHeight >= geometry.viewportHeight, "Workspace fills the viewport");
}
try {
  await server.listen();
  browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
  page = await browser.newPage({ width: 1660, height: 934 });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installFolderBrowserFixture.toString()})();` });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__workspace-height`, { settleMs: 400 });
  await until(() => document.querySelector('[aria-label="자료 폴더 연결"] button'));
  await page.eval(async () => {
    await listingProbe.prepare();
    listingProbe.preparing = true;
    try { await (await listingProbe.a.getDirectoryHandle("참고", { create: true })).getDirectoryHandle("월별", { create: true }); }
    finally { listingProbe.preparing = false; }
  });
  await click('[aria-label="자료 폴더 연결"] button');
  await until(() => document.getElementById("message-draft"));
  await page.eval(() => history.replaceState(history.state, "", "/files"));
  await click('[data-fixture-view="files"]');
  await until(() => document.querySelector('[aria-label="빈 폴더 폴더 열기"]'));
  for (const width of [1660, 1440, 1920, 768, 390]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 934, deviceScaleFactor: 1, mobile: false });
    await click('[aria-label="빈 폴더 폴더 열기"]');
    await until(() => document.querySelector('[aria-current="location"]')?.textContent === "빈 폴더");
    await measure("empty folder without preview", width);
    await click('[aria-label="현재 폴더 위치"] button');
    await until(() => document.querySelector('[aria-label="참고 폴더 열기"]'));
    await click('[aria-label="참고 폴더 열기"]');
    await until(() => document.querySelector('[aria-label="월별 폴더 열기"]'));
    await measure("folder-only without preview", width);
    await page.screenshot({ path: `${output}/folder-only-${width}.png`, format: "png" });
    await click('[aria-label="현재 폴더 위치"] button');
    await until(() => document.querySelector('[aria-label="읽기 안내.md 미리보기"]'));
    await measure("files without preview", width);
    for (const name of ["읽기 안내.md", "할 일.txt"]) {
      await click(`[aria-label="${name} 미리보기"]`);
      await until(() => document.querySelector('dialog[aria-label="문서 미리보기"][open] [aria-label="문서 본문"]'));
      await measure("opened " + name, width);
      assert.equal(checks.at(-1).modal, width < 768, "Mobile preview remains a modal");
      await page.eval(() => {
        [...document.querySelectorAll('dialog[aria-label="문서 미리보기"] button')]
          .find(node => node.textContent.trim() === "목록으로 돌아가기").setAttribute("data-close-preview", "true");
      });
      await click("[data-close-preview]");
      await until(() => !document.querySelector('dialog[aria-label="문서 미리보기"][open]'));
    }
    await until(() => document.querySelector('[aria-label="빈 폴더 폴더 열기"]'));
  }
  assert.equal(await page.eval(() => listingProbe.productWrites), 0, "Layout checks never write source files");
  assert.deepEqual(page.consoleErrors, []);
  console.log(JSON.stringify({ passed: checks.length, output }));
} finally {
  if (browser) await browser.close();
  await server.close();
}
