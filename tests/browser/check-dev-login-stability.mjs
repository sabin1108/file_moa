import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3034";
const output = process.argv[3] ?? "docs/verification/dev-login-stability/after.json";
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
const requests = [];
const reloadReasons = [];
const samples = [];
let exceptions = [];
let sessionProbe;

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });

  browser.on(page.sessionId, "Network.requestWillBeSent", event => {
    const url = new URL(event.request.url);

    if (url.origin === base && ["/", "/login"].includes(url.pathname)) requests.push({ path: url.pathname, method: event.request.method, type: event.type });
  });
  browser.on(page.sessionId, "Network.webSocketFrameReceived", event => {
    try {
      const message = JSON.parse(event.response.payloadData);

      if ((message.action ?? message.type) === "reloadPage") reloadReasons.push(String(message.data ?? "unknown").replaceAll(process.cwd(), "PROJECT_ROOT").slice(0, 400));
    } catch { /* Other development socket messages are outside this check. */ }
  });
  await page.send("Network.enable");
  await page.goto(base + "/login", { settleMs: 500 });

  for (let index = 0; index < 6; index++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    samples.push(await page.eval(() => ({
      path: location.pathname,
      formVisible: document.querySelector("[data-auth-form]")?.checkVisibility() ?? false,
      loading: document.body.innerText.trim() === "화면을 준비하고 있어요.",
    })));
  }

  sessionProbe = await page.eval(async () => {
    const response = await fetch('/api/auth/get-session', { cache: 'no-store' });

    return { status: response.status, anonymous: await response.json() === null };
  });
  exceptions = page.consoleErrors;
} finally {
  await browser.close();
}

const result = {
  condition: "Isolated Chromium without account cookies; actual local Next dev server, six one-second samples and public session API; no sign-in credentials or model call",
  requests,
  reloadReasons: [...new Set(reloadReasons)],
  reloadCount: reloadReasons.length,
  samples,
  exceptions,
  sessionProbe,
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  requests: requests.length,
  reloadCount: result.reloadCount,
  reloadReasons: result.reloadReasons,
  stableSamples: samples.filter(sample => sample.formVisible && !sample.loading).length,
  sessionProbe
}));
assert.equal(
  result.reloadCount,
  0,
  "dev server must not force repeated page reloads without an edit"
);
assert.ok(
  samples.every(sample => sample.path === "/login" && sample.formVisible && !sample.loading),
  "login form must remain visible while the source is idle"
);
assert.equal(exceptions.length, 0, "no browser runtime exceptions");
assert.deepEqual(
  sessionProbe,
  { status: 200, anonymous: true },
  "visible login form must also have a working anonymous session API"
);
