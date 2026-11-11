import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { installFolderBrowserFixture } from "../fixtures/folder-browser-fixture.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = process.argv[2] ?? "docs/verification/live-ai-transfer";

mkdirSync(output, { recursive: true });

const server = await createServer({
  configFile: false,
  cacheDir: resolve(".omx/browser-cache/check-live-ai-transfer"),
  root: resolve("apps/web"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: {
    alias: {
      "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "@personal-ai/domain": resolve("packages/domain/src/index.ts")
    }
  },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [
    {
      name: "local-organization-fixture",
      configureServer(server) {
        server.middlewares.use("/__local-organization", (_req, res) => {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            '<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>'
          );
        });
      }
    }
  ]
});

await server.listen();

const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await Browser.launch({
  extraArgs: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-software-rasterizer",
    "--disable-dev-shm-usage",
    "--no-sandbox"
  ]
});
const checks = [],
  timings = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  assert.ok(passed, name);
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const body = "관련 없는 첫부분 ".repeat(500) + "LCP 성능 테스트 실측 결과\r\n합성 자료입니다.";
let page;

async function until(predicate) {
  for (let index = 0; index < 300; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;

    await pause(30);
  }

  writeFileSync(
    `${output}/browser-failure.json`,
    JSON.stringify(
      { text: await page.eval(() => document.body.innerText), errors: page.consoleErrors },
      null,
      2
    )
  );

  throw Error("Local preparation fixture timed out");
}

async function click(selector) {
  await page.eval(selector => {
    const node = document.querySelector(selector);

    for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS" && parent.querySelector(":scope > summary") !== node) parent.open = true;
    }
  }, selector);

  for (let index = 0; index < 200; index++) {
    const ready = await page.eval(selector => {
      const node = document.querySelector(selector);
      const drawer = node?.closest("dialog");

      return (
        node?.checkVisibility() &&
        !node.disabled &&
        (!drawer || drawer.dataset.drawerState === "open")
      );
    }, selector);

    if (ready) break;

    if (index === 199) throw Error("Control not ready: " + selector);

    await pause(30);
  }

  const point = await page.eval(async selector => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    const node = document.querySelector(selector);

    assertNode(node, selector);

    function assertNode(node, selector) {
      if (!node) throw Error("Missing " + selector);
    }

    node.scrollIntoView({ block: "center", behavior: "instant" });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    const rect = node.getBoundingClientRect();
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

    if (!node.contains(document.elementFromPoint(point.x, point.y)))
      throw Error("Obscured control: " + selector + " " + document.elementFromPoint(point.x, point.y)?.outerHTML);

    return point;
  }, selector);

  for (const type of ["mousePressed", "mouseReleased"])
    await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
}

async function fill(selector, text) {
  await page.eval(selector => {
    const node = document.querySelector(selector);

    node.focus();
    node.select();
  }, selector);
  await page.send("Input.insertText", { text });
}

async function openPanel() {
  await until(() => document.querySelector("[data-conversation-interaction]"));

  const closed = await page.eval(() => {
    const details = document.querySelector("[data-local-snapshot] > details");

    return details && !details.open;
  });

  if (closed) await click("[data-local-snapshot] > details > summary");
}

async function closePanel() {
  const open = await page.eval(() => !!document.querySelector("[data-local-snapshot] > details")?.open);

  if (open) await click("[data-local-snapshot] > details > summary");
}

async function prepare() {
  await until(() => document.querySelector("[data-local-prepare]"));

  const start = performance.now();

  await click("[data-local-prepare]");
  await pause(80);
  await until(() => document.querySelector("[data-local-snapshot]"));
  timings.push({
    elapsedMs: Math.round(performance.now() - start),
    width: await page.eval(() => innerWidth)
  });
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });

  let posts = 0, external = 0;

  await page.send("Network.enable");
  browser.on(page.sessionId, "Network.requestWillBeSent", event => {
    if (event.request.method === "POST") posts++;

    if (/^https?:/.test(event.request.url) && !event.request.url.startsWith(base)) external++;
  });
  await page.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(base + "/__local-organization?transfer", { settleMs: 500 });
  await until(() => document.querySelector('[aria-label="자료 폴더 연결"] button:not(:disabled)'));
  await page.eval(async body => {
    await listingProbe.prepare();
    listingProbe.preparing = true;

    try {
      const file = await listingProbe.a.getFileHandle("중립문서.txt", { create: true });
      const writer = await file.createWritable();

      await writer.write(body);
      await writer.close();
    } finally {
      listingProbe.preparing = false;
    }

    const getFile = FileSystemFileHandle.prototype.getFile;

    listingProbe.bodyHolds = [];
    FileSystemFileHandle.prototype.getFile = function () {
      if (listingProbe.holdBody && !listingProbe.preparing)
        return new Promise(resolve => listingProbe.bodyHolds.push(() => resolve(getFile.call(this))));

      return getFile.call(this);
    };
  }, body);
  await click('[aria-label="자료 폴더 연결"] button');
  await until(() => document.getElementById("message-draft"));
  await fill("#message-draft", "웹사이트 성능 테스트 자료를 내용으로 찾아 정리하고 싶어");
  await page.eval(() => document.getElementById("message-draft").dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter",
    keyCode: 229,
    isComposing: true,
    bubbles: true,
    cancelable: true
  })));
  check(
    "composing Enter never starts read or transfer",
    await page.eval(() => listingProbe.productBodyReads === 0 && liveTransferProbe.calls.length === 0)
  );
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-local-preparation]"));
  await click("[data-local-preparation] button[aria-pressed]");
  await prepare();
  check(
    "preparation has no provider call",
    await page.eval(() => liveTransferProbe.calls.length === 0)
  );
  await click('[aria-label="중립문서.txt 미리보기"]');
  await until(() => [...document.querySelectorAll("pre")].some(node => node.textContent.includes("LCP 성능 테스트")));
  check(
    "excerpt is independently hashed from actual Worker bytes",
    await page.eval(
      hash => document.querySelector("[data-local-snapshot]").textContent.includes(hash),
      createHash("sha256").update(body).digest("hex")
    )
  );
  await click("[data-local-consent]");
  check(
    "consent does not send without the explicit button",
    await page.eval(() => liveTransferProbe.calls.length === 0 && !document.querySelector("[data-live-send]").disabled)
  );

  const transferStarted = performance.now();

  await page.send("Page.bringToFront");
  await page.eval(() => document.querySelector("[data-live-send]").focus());
  check(
    "transfer button accepts keyboard focus",
    await page.eval(() => document.activeElement === document.querySelector("[data-live-send]"))
  );
  await page.send(
    "Input.dispatchKeyEvent",
    {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
      unmodifiedText: "\r"
    }
  );
  await page.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }
  );
  await until(() => document.querySelector("[data-live-result]"));
  check(
    "native button Enter activates exactly one explicit transfer",
    await page.eval(() => liveTransferProbe.calls.length === 1)
  );
  timings.push({ operation: "recheck-and-mocked-action", elapsedMs: performance.now() - transferStarted });
  check("one explicit call receives only selected excerpts and browser owner", await page.eval(() => {
    const call = liveTransferProbe.calls[0];

    return liveTransferProbe.calls.length === 1 && call.owner.userId === "organization-A"
      &&
      call.documents.length === document.querySelectorAll('[aria-label="자료별 발췌와 선택"] input:checked').length
      &&
      call.documents.every(document => document.excerpt.length <= 1200 && !Object.hasOwn(document, "handle"));
  }));
  check("success consumes consent and exposes evidence, held reasons and usage", await page.eval(() =>
    !document.querySelector("[data-local-consent]").checked && document.querySelector("[data-live-send]").disabled
    &&
    document.querySelector("[data-live-result]").textContent.includes("120토큰")
    &&
    document.querySelector("[data-live-result] blockquote")
    &&
    document.querySelector("[data-live-result]").textContent.includes("실제 실행 여부")
  ));

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await pause(300);
    check(
      `${width}: result has no page overflow`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
    );
    await page.eval(() => document.querySelector("[data-live-result]").scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `${output}/result-${width}.png`, format: "png", fullPage: true });
  }

  await page.setViewport({ width: 1440, height: 1000 });
  await closePanel();

  for (let index = 0; index < 10; index++) {
    await openPanel();
    await closePanel();
  }

  check(
    "ten material detail toggles preserve result and never send again",
    await page.eval(() => liveTransferProbe.calls.length === 1 && !!document.querySelector("[data-live-result]"))
  );
  await click('[data-fixture-view="settings"]');
  await click('[data-fixture-view="chat"]');
  await until(() => document.getElementById("message-draft"));
  await openPanel();
  check(
    "Provider keeps the result across route-like remounts without retransmit",
    await page.eval(() => liveTransferProbe.calls.length === 1 && !!document.querySelector("[data-live-result]"))
  );
  await prepare();
  await click("[data-local-consent]");
  await page.eval(async body => {
    listingProbe.preparing = true;

    try {
      const handle = await listingProbe.a.getFileHandle("중립문서.txt");
      const writer = await handle.createWritable();

      await writer.write(body.replace("관련", "무관"));
      await writer.close();
    } finally {
      listingProbe.preparing = false;
    }
  }, body);
  await click("[data-live-send]");
  await until(() => !document.querySelector("[data-local-snapshot]") && document.body.textContent.includes("원본 내용이나 읽기 권한"));
  check(
    "same-size external content change revokes snapshot/consent without an Action",
    await page.eval(() => liveTransferProbe.calls.length === 1)
  );
  await prepare();
  await click("[data-local-consent]");
  await page.eval(() => {
    listingProbe.holdBody = true;
  });
  await click("[data-live-send]");
  await until(() => listingProbe.bodyHolds.length > 0);
  await page.eval(() => [...document.querySelectorAll("button")].find(button => button.textContent === "전송 준비 중지").click());
  await page.eval(() => {
    listingProbe.holdBody = false;
    listingProbe.bodyHolds.splice(0).forEach(resolve => resolve());
  });
  await pause(150);
  check(
    "cancelled in-flight real disk recheck never starts an Action",
    await page.eval(() => liveTransferProbe.calls.length === 1 && !document.querySelector("[data-local-snapshot]"))
  );
  await prepare();
  await click("[data-local-consent]");
  await page.eval(() => {
    liveTransferProbe.mode = "failure";
  });
  await click("[data-live-send]");
  await until(() => document.body.textContent.includes("AI 요청 한도에 도달"));
  await pause(150);
  check(
    "limit error has no automatic retry and needs fresh consent",
    await page.eval(() => liveTransferProbe.calls.length === 2 && !document.querySelector("[data-local-consent]").checked
      && document.querySelector("[data-live-send]").disabled)
  );
  await click("[data-local-consent]");
  await page.eval(() => {
    liveTransferProbe.mode = "hold";
  });
  await click("[data-live-send]");
  await until(() => liveTransferProbe.finish);
  check(
    "pending Action disables another send",
    await page.eval(() => liveTransferProbe.calls.length === 3 && document.querySelector("[data-live-send]").disabled)
  );
  await page.eval(() => [...document.querySelectorAll("button")].find(button => button.textContent === "응답 대기 중지").click());
  await page.eval(() => liveTransferProbe.finish());
  await pause(150);
  check(
    "cancel drops late provider results and explains already consumed usage",
    await page.eval(() => !document.querySelector("[data-live-result]") && document.body.textContent.includes("사용량은 반환되지 않을 수"))
  );
  await prepare();
  await click("[data-local-consent]");
  await click("[data-live-send]");
  await until(() => liveTransferProbe.calls.length === 4);
  await page.eval(() => document.querySelector('[data-fixture-owner]').click());
  await page.eval(() => liveTransferProbe.finish());
  await pause(200);
  check(
    "owner change clears pending state and discards late results",
    await page.eval(() => !document.querySelector("[data-live-result]") && !document.querySelector("[data-local-snapshot]"))
  );
  await page.goto(base + "/__local-organization?transfer", { settleMs: 500 });
  check(
    "F5 initializes state and never automatically resends",
    await page.eval(() => liveTransferProbe.total === 4 && liveTransferProbe.calls.length === 0
      && !document.querySelector("[data-local-snapshot]"))
  );
  check(
    "no product writes or external requests (mocked provider transport)",
    await page.eval(() => listingProbe.productWrites === 0) && posts === 0 && external === 0,
    { posts, external }
  );
  check("no runtime errors", page.consoleErrors.length === 0, page.consoleErrors);
  writeFileSync(
    `${output}/browser-checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        condition: "real React/provider/session/Worker/OPFS with synthetic owner, permission and Action/provider transport; Next navigation shim",
        checks,
        timings
      },
      null,
      2
    )
  );
  console.log(`${checks.length} live transfer browser checks passed.`);
} finally {
  await browser.close();
  await server.close();
}
