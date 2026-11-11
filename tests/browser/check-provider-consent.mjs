import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = "docs/verification/openai-provider";

mkdirSync(output, { recursive: true });

const server = await createServer({
  configFile: false,
  cacheDir: resolve(".omx/browser-cache/provider-consent"),
  root: resolve("apps/web"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{
    name: "provider-consent-fixture",
    configureServer(server) {
      server.middlewares.use("/__provider", (_req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/provider-consent.tsx"></script></html>');
      });
    }
  }],
});

await server.listen();

const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] });
const results = [];

function check(name, passed) {
  results.push({ name, passed: !!passed });
  assert.ok(passed, name);
}

let externalRequests = 0;

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });

  browser.on(page.sessionId, "Network.requestWillBeSent", event => {
    if (/api\.openai\.com|generativelanguage\.googleapis\.com/.test(event.request.url)) externalRequests++;
  });
  await page.send("Network.enable");
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__provider`, { settleMs: 500 });

  for (let i = 0; i < 100 && !await page.eval(() => !!document.querySelector("[data-local-consent]")); i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  check(
    "OpenAI disclosure is visible and unconfirmed send is blocked",
    await page.eval(() => document.body.innerText.includes("OpenAI에 선택한 파일") && document.querySelector("[data-live-send]").disabled)
  );
  await page.eval(() => document.querySelector("[data-local-consent]").focus());
  await page.send(
    "Input.dispatchKeyEvent",
    { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 }
  );
  await page.send(
    "Input.dispatchKeyEvent",
    { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }
  );
  check(
    "keyboard confirmation enables send",
    await page.eval(() => document.querySelector("[data-local-consent]").checked && !document.querySelector("[data-live-send]").disabled)
  );

  async function selectProvider(value) {
    await page.eval(value => {
      const select = document.querySelector("[data-provider]");

      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }

  await selectProvider("gemini");
  check(
    "provider change updates disclosure and revokes confirmation",
    await page.eval(() => document.body.innerText.includes("Google Gemini에 선택한 파일") && !document.querySelector("[data-local-consent]").checked
      && document.querySelector("[data-live-send]").disabled)
  );
  await selectProvider("openai");
  check(
    "switching back does not restore old confirmation",
    await page.eval(() => !document.querySelector("[data-local-consent]").checked && document.querySelector("[data-live-send]").disabled)
  );
  await selectProvider("");
  check(
    "missing configuration disables confirmation",
    await page.eval(() => document.querySelector("[data-local-consent]").disabled && document.querySelector("[data-live-send]").disabled)
  );
  await selectProvider("openai");

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(
      `${width}: confirmation fits viewport`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
    );
  }

  await page.eval(() => document.querySelector("[data-local-consent]").click());
  await page.eval(() => document.querySelector("[data-live-send]").click());

  for (let i = 0; i < 100 && !await page.eval(() => document.querySelector("[data-calls]").textContent === "1"); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  check(
    "explicit send invokes transport once and consumes confirmation",
    await page.eval(() => document.querySelector("[data-calls]").textContent === "1" && !document.querySelector("[data-local-consent]").checked
      && document.querySelector("[data-live-send]").disabled)
  );
  await new Promise(resolve => setTimeout(resolve, 150));
  check(
    "no automatic retry, external call or component exception",
    externalRequests === 0 && page.consoleErrors.length === 0
    && await page.eval(() => document.querySelector("[data-calls]").textContent === "1")
  );
  await page.screenshot({ path: `${output}/consent-1920.png`, format: "png", fullPage: true });
} finally {
  await browser.close();
  await server.close();
  writeFileSync(
    `${output}/browser-checks.json`,
    JSON.stringify(
      {
        condition: "Actual React consent component and preparation controller; synthetic files, identity and transport; no paid API or physical disk",
        results
      },
      null,
      2
    )
  );
}

console.log(JSON.stringify({ checks: results.length, passed: true }));
process.exit(0);
