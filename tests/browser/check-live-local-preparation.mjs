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
const output = process.argv[2] ?? "docs/verification/live-local-preparation";

mkdirSync(output, { recursive: true });

const server = await createServer({
  configFile: false,
  cacheDir: resolve(".omx/browser-cache/check-live-local-preparation"),
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

  const point = await page.eval(selector => {
    const node = document.querySelector(selector);

    assertNode(node, selector);

    function assertNode(node, selector) {
      if (!node) throw Error("Missing " + selector);
    }

    node.scrollIntoView({ block: "center", behavior: "instant" });

    const rect = node.getBoundingClientRect();

    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
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
  await until(() => document.querySelector("[data-local-snapshot]"));
  timings.push({
    elapsedMs: Math.round(performance.now() - start),
    width: await page.eval(() => innerWidth)
  });
}

try {
  page = await browser.newPage({ width: 1440, height: 1000 });

  let posts = 0,
    external = 0;

  await page.send("Network.enable");
  browser.on(page.sessionId, "Network.requestWillBeSent", event => {
    if (event.request.method === "POST") posts++;

    if (/^https?:/.test(event.request.url) && !event.request.url.startsWith(base)) external++;
  });
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${installFolderBrowserFixture.toString()})();`
  });
  await page.goto(base + "/__local-organization", { settleMs: 500 });
  await until(() => document.querySelector('[aria-label="자료 폴더 연결"] button:not(:disabled)'));
  check(
    "disconnected chat stays compact",
    await page.eval(() => !document.getElementById("message-draft"))
  );
  await page.eval(async body => {
    await listingProbe.prepare();
    listingProbe.preparing = true;

    try {
      const file = await listingProbe.a.getFileHandle("중립문서.txt", { create: true });
      const stream = await file.createWritable();

      await stream.write(body);
      await stream.close();

      const history = await listingProbe.a.getDirectoryHandle(".moa-history", { create: true });
      const hidden = await history.getFileHandle("내부기록.txt", { create: true });
      const writer = await hidden.createWritable();

      await writer.write("내부 기록 본문");
      await writer.close();
    } finally {
      listingProbe.preparing = false;
    }
  }, body);
  await click('[aria-label="자료 폴더 연결"] button');
  await until(() => document.getElementById("message-draft"));
  check(
    "connecting does not read document bodies",
    await page.eval(() => listingProbe.productBodyReads === 0 && listingProbe.productWrites === 0)
  );
  await fill("#message-draft", "웹사이트 성능 테스트 자료를 내용으로 찾아 정리하고 싶어");
  await page.eval(() => {
    window.originalComposer = document.getElementById("message-draft");
    originalComposer.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        keyCode: 229,
        isComposing: true,
        bubbles: true,
        cancelable: true
      })
    );
  });
  check(
    "Korean composing Enter never starts preparation",
    await page.eval(
      () =>
        !document.querySelector("[data-local-preparation]") &&
        listingProbe.productBodyReads === 0
    )
  );
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    modifiers: 8,
    text: "\r"
  });
  await page.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    modifiers: 8
  });
  check(
    "Shift+Enter keeps a newline",
    await page.eval(() => document.getElementById("message-draft").value.includes("\n"))
  );
  await click('[data-action="organization-send"]');
  await until(() => document.querySelector("[data-local-preparation]"));
  check(
    "missing scope asks before body I/O",
    await page.eval(
      () =>
        document.querySelector('[aria-label="현재 탐색 범위"]').textContent.includes("어디에서")
        &&
        listingProbe.productBodyReads === 0
    )
  );
  await click("[data-local-preparation] button[aria-pressed]");
  await click('[aria-label="참고 폴더 선택"]');
  await until(() => document.querySelector('[aria-label="하위 자료 참고 폴더 열기"]'));
  await click('[aria-label="하위 자료 참고 폴더 열기"]');
  await until(() => document.querySelector('[aria-label="하위 자료 폴더를 참고로 선택"]'));
  await click('[aria-label="하위 자료 폴더를 참고로 선택"]');
  check(
    "reference folder never narrows the whole scope",
    await page.eval(
      () =>
        document.querySelector('[aria-label="현재 탐색 범위"]').textContent.includes("전체")
        &&
        document
          .querySelector("[data-local-preparation]")
          .textContent.includes("검증 자료 A / 하위 자료")
    )
  );
  await click('button[aria-label="목적지 폴더 선택"]');
  await until(() => document.querySelector('[aria-label="검증 자료 A 폴더를 목적지로 선택"]'));
  await click('[aria-label="검증 자료 A 폴더를 목적지로 선택"]');
  check(
    "folder choices do not offer creation or perform writes",
    await page.eval(() => listingProbe.productWrites === 0)
  );
  await prepare();
  check(
    "real Worker reads nested TXT/MD with no hidden history or PDF",
    await page.eval(() => {
      const names = [...document.querySelectorAll('[aria-label="자료별 발췌와 선택"] input')].map(
        input => input.getAttribute("aria-label")
      );

      return (
        names.includes("하위 문서.txt 선택") &&
        names.includes("중립문서.txt 선택") &&
        !names.includes("내부기록.txt 선택")
        &&
        !names.some(name => name.includes(".pdf"))
      );
    })
  );
  await click('[aria-label="중립문서.txt 미리보기"]');
  await until(() => [...document.querySelectorAll("pre")].some(node => node.textContent.includes("LCP 성능 테스트 실측 결과")));
  check(
    "body words beyond the document beginning appear in the actual excerpt",
    await page.eval(() =>
      [...document.querySelectorAll("pre")].some(node =>
        node.textContent.includes("LCP 성능 테스트 실측 결과")
      )
    )
  );
  check(
    "whole-file SHA256 matches independent expected bytes",
    await page.eval(
      hash => document.querySelector("[data-local-snapshot]").textContent.includes(hash),
      createHash("sha256").update(body).digest("hex")
    )
  );
  await click("[data-local-consent]");
  check(
    "explicit candidate confirmation is stored without a POST",
    (await page.eval(() => document.querySelector("[data-local-consent]").checked)) && posts === 0
  );
  await click('[aria-label="중립문서.txt 선택"]');
  check(
    "excluding a candidate revokes prior consent",
    await page.eval(() => !document.querySelector("[data-local-consent]").checked)
  );
  await click('[aria-label="중립문서.txt 선택"]');
  await click("[data-local-consent]");
  await closePanel();

  for (let index = 0; index < 10; index++) {
    await openPanel();
    await closePanel();
  }

  check(
    "ten material detail transitions preserve the composer and request",
    await page.eval(
      () =>
        originalComposer === document.getElementById("message-draft") &&
        originalComposer.value.includes("성능 테스트")
    )
  );
  check(
    "native detail close leaves focus on its summary",
    await page.eval(
      () => document.activeElement === document.querySelector("[data-local-snapshot] > details > summary")
    )
  );
  await click('[data-fixture-view="settings"]');
  await click('[data-fixture-view="chat"]');
  await until(() => document.getElementById("message-draft"));
  await openPanel();
  check(
    "Provider lifetime keeps preparation across screen unmount/remount",
    await page.eval(
      () =>
        !!document.querySelector("[data-local-snapshot]") &&
        document.querySelector("[data-local-consent]").checked
        &&
        document.getElementById("message-draft").value.includes("성능 테스트")
    )
  );

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await page.eval(
      () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    await until(
      () =>
        document.querySelector("[data-conversation-interaction]").checkVisibility()
        &&
        document
          .querySelector("[data-conversation-interaction]")
          .getAnimations()
          .every(animation => animation.playState !== "running")
    );
    check(
      `${width}: no horizontal overflow`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
    );
    await page.screenshot({
      path: `${output}/prepared-${width}.png`,
      format: "png",
      fullPage: true
    });
  }

  await page.setViewport({ width: 1440, height: 1000 });
  await click("[data-organization-conditions] > summary");
  await fill("[data-local-preparation] textarea", "보고일의 의미를 확인하고 정리");
  check(
    "basis changes invalidate the snapshot and confirmation",
    await page.eval(() => !document.querySelector("[data-local-snapshot]"))
  );
  await prepare();
  await page.eval(() => {
    listingProbe.holdRead = true;
  });
  await click("[data-local-prepare]");
  await until(() => listingProbe.holds.length > 0);
  await page.eval(() =>
    [...document.querySelectorAll("button")]
      .find(button => button.textContent === "자료 읽기 중지")
      .click()
  );
  await page.eval(() => {
    listingProbe.holdRead = false;
    listingProbe.holds.splice(0).forEach(resolve => resolve());
  });
  await pause(150);
  check(
    "cancelled reads never publish a late snapshot",
    await page.eval(
      () =>
        !document.querySelector("[data-local-snapshot]") &&
        document.body.textContent.includes("자료 읽기를 중지했어요")
    )
  );
  await prepare();
  await closePanel();
  await click('[data-fixture-view="files"]');
  await until(() => document.querySelector('[aria-label="중립문서.txt 미리보기"]'));
  await page.eval(() => document.querySelector('[aria-label="중립문서.txt 미리보기"]').focus());
  await page.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 }
  );
  await page.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }
  );
  await until(() => document.querySelector('[aria-label="중립문서.txt 선택"]')?.checked);
  await click('[data-fixture-view="chat"]');
  await openPanel();
  await click('[data-local-preparation] details > summary');
  await page.eval(() => [...document.querySelectorAll('[data-local-preparation] button')].find(button => button.textContent.includes("내 파일에서 선택한 1개")).click());
  await prepare();
  check(
    "selected-file scope never expands to other folders or files",
    await page.eval(() => document.querySelectorAll('[aria-label="자료별 발췌와 선택"] input').length === 1
      && !!document.querySelector('[aria-label="중립문서.txt 선택"]'))
  );
  await closePanel();
  check(
    "original sentinel is unchanged and zero product writes",
    await page.eval(
      async () =>
        JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)
        &&
        listingProbe.productWrites === 0
    )
  );
  check("zero local or external POST/API calls", posts === 0 && external === 0, {
    posts,
    external
  });
  await click("[data-fixture-owner]");
  await until(() => !document.getElementById("message-draft"));
  check(
    "owner switch clears private request and prepared excerpts",
    await page.eval(
      () =>
        !document.body.textContent.includes("웹사이트 성능 테스트 자료를 내용으로") &&
        !document.querySelector("[data-local-snapshot]")
    )
  );
  await click("[data-fixture-owner]");
  await until(() => document.getElementById("message-draft"));
  check(
    "returning owner does not restore private draft or consent",
    await page.eval(
      () =>
        document.getElementById("message-draft").value === "" &&
        !document.querySelector("[data-local-snapshot]")
    )
  );
  await page.goto(base + "/__local-organization", { settleMs: 300 });
  await until(() => document.getElementById("message-draft"));
  check(
    "F5 restores only the granted folder, never scanning or replaying a request",
    (await page.eval(
      () =>
        document.getElementById("message-draft").value === "" &&
        !document.querySelector("[data-local-snapshot]")
        &&
        listingProbe.productBodyReads === 0
    ))
    && posts === 0
  );
  check("no component or Worker exceptions", page.consoleErrors.length === 0, page.consoleErrors);
} finally {
  await browser.close();
  await server.close();
  writeFileSync(
    `${output}/browser-checks.json`,
    JSON.stringify(
      {
        condition:
          "Actual product components, session, Worker and IndexedDB with synthetic owner and Chromium OPFS; Next routing shim; no physical Windows folder/authenticated-route claim",
        checks,
        timings
      },
      null,
      2
    )
  );
}

console.log(JSON.stringify({ checks: checks.length, timings }));
