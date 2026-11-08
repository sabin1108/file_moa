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
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
const output = process.argv[2] ?? "docs/verification/document-find/browser";
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  cacheDir: resolve(".omx/browser-cache/document-find"),
  root: resolve("apps/web"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: {
    alias: {
      "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "@personal-ai/domain": resolve("packages/domain/src/index.ts"),
    },
  },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [
    {
      name: "find-fixture",
      configureServer(server) {
        server.middlewares.use("/__find", (_req, res) => {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            '<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>',
          );
        });
      },
    },
  ],
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await Browser.launch({
  extraArgs: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-software-rasterizer",
    "--disable-dev-shm-usage",
    "--no-sandbox",
  ],
});
const checks = [];
const tasteChecks = [];
const check = (name, passed) => {
  checks.push({ name, passed: !!passed });
  assert.ok(passed, name);
};
let page;
async function inspectApp(state, width) {
  await page.eval(async () => { await document.fonts.ready; await new Promise(resolve => setTimeout(resolve, 350)); });
  await page.eval(() => { document.querySelector('[data-fixture-view]')?.parentElement.setAttribute('hidden', ''); });
  const metrics = await page.eval(probe);
  const geometry = await page.eval(layout);
  const appMetrics = await page.eval(app);
  const findings = [...judge(metrics, { width }), ...judgeLayout(geometry, { width })].filter(finding => !APP_SKIP.has(finding.id) && !['no-title','small-title'].includes(finding.id));
  findings.push(...judgeApp(appMetrics, metrics, { width }));
  tasteChecks.push({ state, width, findings });
  await page.eval(() => { document.querySelector('[data-fixture-view]')?.parentElement.removeAttribute('hidden'); });
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 300; i++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;
    await pause(35);
  }
  throw Error("Find fixture timed out: " + predicate);
}
async function click(selector) {
  const point = await page.eval((selector) => {
    const node = document.querySelector(selector);
    if (!node) throw Error("Missing " + selector);
    for (let parent = node.parentElement; parent; parent = parent.parentElement)
      if (
        parent.tagName === "DETAILS" &&
        node !== parent.querySelector(":scope > summary")
      )
        parent.open = true;
    node.scrollIntoView({ block: "center", behavior: "instant" });
    const r = node.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", {
      type,
      ...point,
      button: "left",
      clickCount: 1,
    });
}
async function fill(selector, text) {
  await page.eval((selector) => {
    const node = document.querySelector(selector);
    node.focus();
    node.select();
  }, selector);
  await page.send("Input.insertText", { text });
}
async function choose(selector, value) {
  await page.eval(
    ({ selector, value }) => {
      const node = document.querySelector(selector);
      node.value = value;
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    { selector, value },
  );
}
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  let external = 0,
    posts = 0;
  await page.send("Network.enable");
  browser.on(page.sessionId, "Network.requestWillBeSent", (event) => {
    if (
      /^https?:/.test(event.request.url) &&
      !event.request.url.startsWith(base)
    )
      external++;
    if (event.request.method === "POST") posts++;
  });
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${installFolderBrowserFixture.toString()})();`,
  });
  await page.goto(base + "/__find?transfer", { settleMs: 400 });
  await until(
    () =>
      typeof liveTransferProbe !== "undefined" &&
      !!document.querySelector(
        '[aria-label="자료 폴더 연결"] button:not(:disabled)',
      ),
  );
  await page.eval(async () => {
    await listingProbe.prepare();
    listingProbe.preparing = true;
    try {
      for (const [name, body] of [
        [
          "late-evidence.md",
          "회의 자료\n" +
            "앞부분 ".repeat(1000) +
            "\n회의일: 2026-10-15\n본문 끝 근거",
        ],
        ["written-only.txt", "회의 자료\n작성일: 2026-10-15"],
        ["outside.md", "회의 자료\n회의일: 2026-11-08"],
        ["conflict.md", "회의 자료\n회의일: 2026-10-15\n회의일: 2026-11-15"],
        ["bad.txt", new Uint8Array([0xc3, 0x28])],
      ]) {
        const writer = await (
          await listingProbe.a.getFileHandle(name, { create: true })
        ).createWritable();
        await writer.write(body);
        await writer.close();
      }
    } finally {
      listingProbe.preparing = false;
    }
  });
  await click('[aria-label="자료 폴더 연결"] button');
  await until(() => document.getElementById("message-draft"));
  await fill(
    "#message-draft",
    "내가 10월쯤 한 회의자료 있는데 그것좀 찾아줄래",
  );
  await page.eval(() => {
    const node = document.getElementById("message-draft");
    node.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    node.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 229,
        isComposing: true,
        bubbles: true,
      }),
    );
  });
  check(
    "IME does not enter finding or start disk reads",
    await page.eval(
      () =>
        !document.querySelector("[data-document-find]") &&
        listingProbe.productBodyReads === 0,
    ),
  );
  await page.eval(() =>
    document
      .getElementById("message-draft")
      .dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })),
  );
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-document-find]"));
  check(
    "find intent asks year, date basis and around period before reading",
    await page.eval(
      () =>
        document.querySelector('[aria-label="찾을 연도"]').value === "" &&
        document.querySelector('[aria-label="검색 날짜 기준"]').value === "" &&
        document.querySelector('[aria-label="검색 기간 범위"]').value === "" &&
        listingProbe.productBodyReads === 0,
    ),
  );
  check(
    "topic is an editable meeting term and no organization proposal is opened",
    await page.eval(
      () =>
        document.querySelector('[aria-label="본문 검색어"]').value === "회의" &&
        !document.querySelector("[data-local-preparation]"),
    ),
  );
  await fill('[aria-label="찾을 연도"]', "2026");
  await choose('[aria-label="검색 날짜 기준"]', "meeting");
  await choose('[aria-label="검색 기간 범위"]', "around");
  check(
    "explicit around choice displays inclusive dates",
    await page.eval(() =>
      document
        .querySelector("[data-find-range]")
        .textContent.includes("2026-09-24 ~ 2026-11-07"),
    ),
  );
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await page.eval(() => {
      document.querySelector('[aria-label="대화 내용"]').scrollTop = 0;
    });
    check(
      `${width}: conditions do not overflow`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth),
    );
    if (width >= 1440)
      check(
        `${width}: confirmed search action fits the first screen`,
        await page.eval(
          () =>
            document.querySelector("[data-find-search]").getBoundingClientRect()
              .bottom <= innerHeight,
        ),
      );
    await page.screenshot({
      path: `${output}/conditions-${width}.png`,
      format: "png",
      fullPage: true,
    });
    await inspectApp('conditions', width);
  }
  await click("[data-find-search]");
  await until(() => document.querySelector("[data-find-results]"));
  check(
    "actual Worker finds evidence beyond the old excerpt",
    await page.eval(
      () =>
        document
          .querySelector("[data-find-results]")
          .textContent.includes("late-evidence.md") &&
        document
          .querySelector("[data-find-results]")
          .textContent.includes("2026-10-15"),
    ),
  );
  check(
    "unknown/conflicting dates stay visible and an outside meeting is omitted",
    await page.eval(() => {
      const text = document.querySelector("[data-find-results]").textContent;
      return (
        text.includes("written-only.txt") &&
        text.includes("conflict.md") &&
        text.includes("날짜 기준 확인 필요") &&
        text.includes("기간 안팎") &&
        !text.includes("outside.md")
      );
    }),
  );
  check(
    "invalid UTF8 marks partial results, and unsupported formats are disclosed",
    await page.eval(() => {
      const text = document.querySelector("[data-find-results]").textContent;
      return (
        text.includes("검색 범위 일부") &&
        text.includes("bad.txt") &&
        text.includes("TXT·MD가 아닌 형식")
      );
    }),
  );
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(
      `${width}: results do not overflow`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth),
    );
    check(
      `${width}: result file rows keep content height`,
      await page.eval(() =>
        [
          ...document.querySelectorAll(
            "[data-find-results] [data-long-press-selection]",
          ),
        ].every((row) => row.getBoundingClientRect().height <= 96),
      ),
    );
    await page.eval(() =>
      document
        .querySelector("[data-find-results]")
        .scrollIntoView({ block: "start" }),
    );
    await page.screenshot({
      path: `${output}/results-${width}.png`,
      format: "png",
      fullPage: true,
    });
    await inspectApp('results', width);
  }
  await click('[aria-label="late-evidence.md 미리보기"]');
  await until(() =>
    document
      .querySelector("[data-find-preview]")
      ?.textContent.includes("본문 끝 근거"),
  );
  check("result opens the existing read-only full document preview", true);
  await page.eval(() =>
    [...document.querySelectorAll("[data-find-preview] button")]
      .find((button) => button.textContent.includes("목록으로 돌아가기"))
      .click(),
  );
  await until(() => document.querySelector("[data-find-results]")?.checkVisibility());
  await until(() => document.activeElement?.getAttribute("aria-label") === "late-evidence.md 미리보기");
  check("return restores focus to the selected result", true);
  await click('[data-fixture-view="files"]');
  await click('[data-fixture-view="chat"]');
  check(
    "same owner navigation preserves search results without another query",
    await page.eval(() => !!document.querySelector("[data-find-results]")),
  );
  await click('[aria-label="late-evidence.md 미리보기"]');
  await until(() => document.querySelector('[data-find-preview]'));
  await fill('#message-draft', '회의 자료 찾아줘');
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector('[data-find-search]')?.checkVisibility());
  await click('[data-find-search]');
  await until(() => document.querySelector('[data-find-results]')?.checkVisibility());
  check('new query clears the previous preview and can search all dates', await page.eval(() => !document.querySelector('[data-find-preview]') && document.querySelector('[data-find-results]').textContent.includes('outside.md')));
  await click("[data-document-find] > details > summary");
  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click("[data-find-search]");
  await until(() => listingProbe.holds.length > 0);
  await page.eval(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("검색 중지"))
      .click(),
  );
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach((resolve) => resolve());
  });
  await pause(100);
  check(
    "cancelled disk work cannot publish late candidates",
    await page.eval(() => !document.querySelector("[data-find-results]")),
  );
  await click("[data-fixture-owner]");
  check(
    "owner change drops the search request and result",
    await page.eval(
      () =>
        !document.querySelector("[data-document-find]") &&
        !document.querySelector("[data-find-results]"),
    ),
  );
  check(
    "zero model or external requests and zero source writes",
    (await page.eval(
      () =>
        liveTransferProbe.calls.length === 0 &&
        listingProbe.productWrites === 0,
    )) &&
      external === 0 &&
      posts === 0,
  );
  check(
    "protected original sentinel is unchanged",
    await page.eval(
      async () =>
        JSON.stringify(await listingProbe.sentinel()) ===
        JSON.stringify(listingProbe.before),
    ),
  );
  check("no component or Worker exceptions", page.consoleErrors.length === 0);
  await page.goto(base + "/__find?transfer", { settleMs: 400 });
  await until(() => typeof liveTransferProbe !== 'undefined' && (document.getElementById('message-draft') || document.querySelector('[aria-label="자료 폴더 연결"] button:not(:disabled)')));
  check('refresh does not resume a search or transmit automatically', await page.eval(() => !document.querySelector('[data-document-find]') && listingProbe.productBodyReads === 0 && liveTransferProbe.calls.length === 0));
  writeFileSync(
    `${output}/browser-checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        condition:
          "Actual product controller/session/Worker/Chromium OPFS; synthetic owner and permission; no physical Windows/IME/authenticated-route claim",
      },
      null,
      2,
    ),
  );
  writeFileSync(`${output}/taste-checks.json`, JSON.stringify(tasteChecks, null, 2));
  assert.equal(tasteChecks.flatMap(entry => entry.findings).filter(finding => finding.level === 'FAIL').length, 0, 'App inspector must have no failing findings');
  console.log(`${checks.length} document find browser checks passed.`);
} catch (error) {
  writeFileSync(
    `${output}/failure.json`,
    JSON.stringify(
      {
        checks,
        error: String(error),
        text: page ? await page.eval(() => document.body.innerText) : "",
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
}
