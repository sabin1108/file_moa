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
    dedupe: ["react", "react-dom"],
    alias: {
      "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "@personal-ai/domain": resolve("packages/domain/src/index.ts"),
    },
  },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"]
  },
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
const check = (name, passed, immediate = true) => {
  checks.push({ name, passed: !!passed });
  if (immediate) assert.ok(passed, name);
};
let page;

async function inspectApp(state, width) {
  await page.eval(async () => {
    await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 350));
  });
  await page.eval(() => {
    document.querySelector('[data-fixture-view]')?.parentElement.setAttribute('hidden', '');
    document.querySelector('[data-fixture-record-controls]')?.setAttribute('hidden', '');
  });

  const metrics = await page.eval(probe);
  const geometry = await page.eval(layout);
  const appMetrics = await page.eval(app);
  const findings = [...judge(metrics, { width }), ...judgeLayout(geometry, { width })].filter(finding => !APP_SKIP.has(finding.id) && !['no-title', 'small-title'].includes(finding.id));

  findings.push(...judgeApp(appMetrics, metrics, { width }));
  tasteChecks.push({ state, width, findings });
  await page.eval(() => {
    document.querySelector('[data-fixture-view]')?.parentElement.removeAttribute('hidden');
    document.querySelector('[data-fixture-record-controls]')?.removeAttribute('hidden');
  });
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
  const point = await page.eval(async (selector) => {
    const node = document.querySelector(selector);

    if (!node) throw Error("Missing " + selector);

    for (let parent = node.parentElement; parent; parent = parent.parentElement)
      if (
        parent.tagName === "DETAILS" &&
        node !== parent.querySelector(":scope > summary")
      )
        parent.open = true;

    node.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    const r = node.getBoundingClientRect();
    const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };

    if (!node.contains(document.elementFromPoint(point.x, point.y))) throw new Error("Occluded " + selector);

    return point;
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

const composerSizes = [];
const generalSizes = new Map();

async function composerSize(target) {
  return target.eval(() => {
    const input = document.getElementById("message-draft");
    const box = input.parentElement.getBoundingClientRect();
    const textarea = input.getBoundingClientRect();

    return {
      rows: input.rows,
      inputWidth: textarea.width,
      inputHeight: textarea.height,
      boxWidth: box.width,
      boxHeight: box.height
    };
  });
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });

  const generalPage = await browser.newPage({ width: 1440, height: 1000 });

  await generalPage.goto(base + "/__find?general", { settleMs: 400 });
  await generalPage.eval(() => document.querySelector('[aria-label="시작할 작업 선택"] button')?.click());

  for (let n = 0; n < 500 && !await generalPage.eval(() => !!document.getElementById("message-draft")); n++) await new Promise(resolve => setTimeout(resolve, 30));

  assert.ok(
    await generalPage.eval(() => !!document.getElementById("message-draft")),
    "General composer is ready before sizing"
  );

  for (const width of [390, 768, 1440, 1920]) {
    await generalPage.setViewport({ width, height: 1000 });
    generalSizes.set(width, await composerSize(generalPage));
  }

  await generalPage.close();

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
  await click('[aria-label="시작할 작업 선택"] button:nth-child(2)');
  await until(
    () =>
      typeof liveTransferProbe !== "undefined"
      &&
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
        ["unsupported.bin", "unsupported format"],
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
  await click('[data-conversation-context] button:first-child');
  await click('[aria-label="자료 폴더 연결"] button');
  await until(() => document.querySelector('[data-folder-tree-root]')
    && [...document.querySelectorAll('button')].some(button => button.textContent === '다른 폴더 선택' && !button.disabled));
  await click('[data-drawer-close]');
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
  // Existing conversations can retain automatic routing after the first task.
  await page.eval(() => conversationFixtureStore.select({ mode: null }));
  check(
    "find intent asks year, date basis and around period before reading",
    await page.eval(
      () =>
        document.querySelector('[aria-label="찾을 연도"]').value === ""
        &&
        document.querySelector('[aria-label="검색 날짜 기준"]').value === ""
        &&
        document.querySelector('[aria-label="검색 기간 범위"]').value === ""
        &&
        listingProbe.productBodyReads === 0,
    ),
  );
  check(
    "topic is an editable meeting term and no organization proposal is opened",
    await page.eval(
      () =>
        document.querySelector('[aria-label="본문 검색어"]').value === "회의"
        &&
        !document.querySelector("[data-local-preparation]"),
    ),
  );
  await fill('#message-draft', '2026년이고 분기별로');
  await click('[data-action="organization-send"]');
  check(
    'unsupported condition reply changes no filters or disk reads',
    await page.eval(() => document.querySelector('[aria-label="찾을 연도"]').value === '' && listingProbe.productBodyReads === 0
      && document.body.textContent.includes('조건을 전부 확인하지 못했어요'))
  );
  await fill('#message-draft', '2026년 회의 날짜 기준 앞뒤 7일 포함');
  await click('[data-action="organization-send"]');
  check(
    'condition reply updates existing controls without automatic search',
    await page.eval(() => document.querySelector('[aria-label="찾을 연도"]').value === '2026'
      && document.querySelector('[aria-label="검색 날짜 기준"]').value === 'meeting'
      && listingProbe.productBodyReads === 0
      && document.getElementById('message-draft').value === ''
      && !document.querySelector('[data-request-intent-choice]'))
  );
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
    await page.eval(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

    const general = generalSizes.get(width);
    const finding = await composerSize(page);

    composerSizes.push({ width, general, finding });
    writeFileSync(
      `${output}/composer-sizes.json`,
      JSON.stringify(
        {
          samples: composerSizes,
          condition: "Actual general/find product components in isolated Chromium; compares the input box and textarea, excluding task-specific notices above the form."
        },
        null,
        2
      )
    );
    check(
      `${width}: general and find composers have equal input and box dimensions`,
      Object.keys(general).every(key => Math.abs(general[key] - finding[key]) < 1)
    );
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
        false,
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
          .textContent.includes("late-evidence.md")
        &&
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
        text.includes("날짜 확인 필요")
        &&
        text.includes("여러 날짜가 있어 확인 필요 · 2026-10-15, 2026-11-15")
        &&
        !text.includes("outside.md")
      );
    }),
  );
  check(
    "invalid UTF8 marks partial results, and unsupported formats are disclosed",
    await page.eval(() => {
      const text = document.querySelector("[data-find-results]").textContent;

      return (
        text.includes("일부 자료는 확인하지 못했어요") &&
        text.includes("bad.txt") &&
        text.includes("TXT·MD·PDF·PNG·JPEG가 아닌 형식")
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
  check(
    'new query clears the previous preview and can search all dates',
    await page.eval(() => !document.querySelector('[data-find-preview]')
      && document.querySelector('[data-find-results]').textContent.includes('outside.md'))
  );
  await click("[data-document-find] > details > summary");
  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click("[data-find-search]");
  await until(() => listingProbe.holds.length > 0);
  await page.eval(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("작업 대기 중지"))
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

  const mixed = "회의 자료를 찾아서 정리해줘";

  await fill("#message-draft", mixed);

  const beforeChoice = await page.eval(() => ({
    scans: listingProbe.scans,
    reads: listingProbe.productBodyReads,
    calls: liveTransferProbe.calls.length
  }));

  await page.eval(() => {
    const input = document.getElementById("message-draft");

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, isComposing: true, bubbles: true }));
  });
  check(
    "composing a mixed request cannot submit or switch workflows",
    await page.eval(() => !document.querySelector("[data-request-intent-choice]"))
  );
  await page.eval(() => document.getElementById("message-draft").dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-request-intent-choice]")?.checkVisibility());
  check(
    "mixed request asks before new scans, reads or model access",
    JSON.stringify(beforeChoice) === JSON.stringify(await page.eval(() => ({
      scans: listingProbe.scans,
      reads: listingProbe.productBodyReads,
      calls: liveTransferProbe.calls.length
    })))
  );
  check(
    "choice receives keyboard focus",
    await page.eval(() => document.activeElement?.textContent === "어떤 작업을 할까요?")
  );

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(
      `${width}: shared request choice fits viewport`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
    );
    await page.screenshot({ path: `${output}/request-choice-${width}.png`, format: "png" });
  }

  await click("[data-request-intent-choice] button:last-child");
  await until(() => document.activeElement?.id === "message-draft");
  check(
    "continuing to write preserves the mixed request",
    await page.eval(() => document.getElementById("message-draft").value === "회의 자료를 찾아서 정리해줘")
  );
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-request-intent-choice]"));
  await click("[data-request-intent-choice] button:nth-of-type(1)");
  await until(() => document.querySelector("[data-document-find]")?.checkVisibility());
  check(
    "choosing search records the request and extracts content words without retaining a sent draft",
    await page.eval(() => document.querySelector('[aria-label="본문 검색어"]').value === "회의" && document.getElementById("message-draft").value === ""
      && document.body.textContent.includes("회의 자료를 찾아서 정리해줘"))
  );
  check(
    "choosing search still waits for explicit search confirmation",
    JSON.stringify(beforeChoice) === JSON.stringify(await page.eval(() => ({
      scans: listingProbe.scans,
      reads: listingProbe.productBodyReads,
      calls: liveTransferProbe.calls.length
    })))
  );
  await fill("#message-draft", mixed);
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-request-intent-choice]"));
  await click("[data-request-intent-choice] button:nth-of-type(2)");
  await until(() => document.querySelector("[data-local-preparation]")?.checkVisibility());
  await until(() => document.querySelector('[data-action="organization-send"]') && !document.getElementById("message-draft").readOnly);
  check(
    "choosing organization leaves search for the existing preparation flow",
    await page.eval(() => !document.querySelector("[data-document-find]") && document.body.textContent.includes("회의 자료를 찾아서 정리해줘"))
  );
  await fill("#message-draft", "회의 자료 찾아줘");
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-document-find]")?.checkVisibility());
  check(
    "organization can switch back to explicit search conditions",
    await page.eval(() => !document.querySelector("[data-request-intent-choice]") && !!document.getElementById("message-draft"))
  );
  await fill("#message-draft", "성능 보고서 정리해줘");
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-local-preparation]")?.checkVisibility());
  check(
    "a clear organization request from search is not started as another search",
    await page.eval(() => !document.querySelector("[data-document-find]") && !document.querySelector("[data-request-intent-choice]"))
  );
  await until(() => document.querySelector('[data-action="organization-send"]') && !document.getElementById("message-draft").readOnly);
  await fill('#message-draft', '2026년 10월 회의일 기준 회의 자료 찾아줘');
  await click('[data-action="organization-send"]');
  await fill('[aria-label="본문 검색어"]', 'not-present-fixture');
  await click('[data-find-search]');
  await until(() => document.querySelector('[data-find-results]'));

  const beforeWiden = await page.eval(() => listingProbe.productBodyReads);

  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent === '기간 제한 없이 다시 확인').click());
  check(
    'empty results widen conditions without scanning automatically',
    await page.eval(
      before => document.querySelector('[aria-label="찾을 달"]').value === 'all' && !document.querySelector('[data-find-results]')
        && listingProbe.productBodyReads === before,
      beforeWiden
    )
  );
  await fill('[aria-label="본문 검색어"]', '회의');
  await click('[data-find-search]');
  await until(() => document.querySelector('[data-find-results]'));
  await click('[aria-label="late-evidence.md 선택"]');
  check(
    'result selection enables existing preparation bridge',
    await page.eval(() => !document.querySelector('[data-find-prepare]').disabled
      && document.querySelector('[data-find-prepare]').textContent.includes('1개'))
  );

  const beforePrepare = await page.eval(() => listingProbe.productBodyReads);

  await click('[data-find-prepare]');
  await until(() => document.querySelector('[data-local-preparation]')?.textContent.includes('late-evidence.md'));
  check(
    'preparation retains the selected source and waits for explicit local confirmation',
    await page.eval(
      before => listingProbe.productBodyReads === before && liveTransferProbe.calls.length === 0
        && document.querySelector('[data-local-preparation]').textContent.includes('선택한 항목 1개'),
      beforePrepare
    )
  );
  await page.eval(() => [...document.querySelectorAll('[data-local-preparation] button')].find(button => button.textContent.trim() === '주제별로').click());
  await until(() => [...document.querySelectorAll('[data-local-preparation] button')].some(button => ['나중에 정할게', '자료 확인 실행'].includes(button.textContent.trim())));
  await page.eval(() => [...document.querySelectorAll('[data-local-preparation] button')].find(button => button.textContent.trim() === '나중에 정할게')?.click());
  await until(() => [...document.querySelectorAll('[data-local-preparation] button')].some(button => button.textContent.trim() === '자료 확인 실행'));
  await page.eval(() => [...document.querySelectorAll('[data-local-preparation] button')].find(button => button.textContent.trim() === '자료 확인 실행').click());
  await until(() => !!document.querySelector('[data-local-snapshot]') || !!document.querySelector('[data-confirm-review]'));
  check('explicit local confirmation re-reads sources without model transmission', await page.eval(before => listingProbe.productBodyReads > before && liveTransferProbe.calls.length === 0, beforePrepare));
  check(
    'fresh preparation has no inherited transfer consent',
    await page.eval(() => !!document.querySelector('[data-live-send]:disabled') && !document.querySelector('[data-local-consent]')?.checked)
  );
  await page.screenshot({ path: `${output}/selected-preparation.png`, format: 'png', fullPage: true });
  await fill("#message-draft", "다른 자료");
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-request-intent-choice]"));
  await click("[data-fixture-owner]");
  check(
    "owner change discards the pending operation choice",
    await page.eval(() => !document.querySelector("[data-request-intent-choice]"))
  );
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
    ))
    &&
    external === 0
    &&
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
  await until(() => typeof liveTransferProbe !== 'undefined'
    && (document.getElementById('message-draft') || document.querySelector('[aria-label="자료 폴더 연결"] button:not(:disabled)')));
  check(
    'refresh does not resume a search or transmit automatically',
    await page.eval(() => !document.querySelector('[data-document-find]') && listingProbe.productBodyReads === 0
      && liveTransferProbe.calls.length === 0)
  );
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
  assert.ok(checks.every(check => check.passed), "All document find checks must pass; see browser-checks.json for deferred layout failures");
  assert.equal(
    tasteChecks.flatMap(entry => entry.findings).filter(finding => finding.level === 'FAIL').length,
    0,
    'App inspector must have no failing findings'
  );
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
