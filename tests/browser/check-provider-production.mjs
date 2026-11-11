import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const publicDisabled = process.argv.includes("--public-disabled");
const outputArgument = process.argv.find(argument => argument.startsWith("--output="));
const output = outputArgument?.slice("--output=".length) ?? "docs/verification/openai-provider";

mkdirSync(output, { recursive: true });

const results = [];
const check = (name, passed) => {
  results.push({ name, passed: !!passed });
  assert.ok(passed, name);
};
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"] });
let providerRequests = 0;

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });

  browser.on(page.sessionId, "Network.requestWillBeSent", event => {
    if (/api\.openai\.com|generativelanguage\.googleapis\.com/.test(event.request.url)) providerRequests++;
  });
  await page.send("Network.enable");
  await page.goto("http://127.0.0.1:3035/", { settleMs: 250 });
  check(
    "workspace still requires authentication",
    await page.eval(() => location.pathname === "/login")
  );
  await page.goto("http://127.0.0.1:3035/demo", { settleMs: 400 });

  for (let i = 0; i < 100 && !await page.eval(() => !!document.querySelector("[data-organization-consent]")); i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  if (publicDisabled) {
    check(
      "public sample AI is disabled in the actual production UI",
      await page.eval(() => document.body.innerText.includes("이 샘플에서는 AI 전송을 사용할 수 없습니다.")
        && document.querySelector("[data-organization-consent]").disabled)
    );
  } else {
    check(
      "production sample discloses OpenAI from server configuration",
      await page.eval(() => document.body.innerText.includes("OpenAI에 전송"))
    );
  }

  check(
    "sample is not pre-consented",
    await page.eval(() => !document.querySelector("[data-organization-consent]").checked)
  );

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    check(
      `${width}: production sample fits viewport`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
    );
  }

  await page.screenshot({ path: `${output}/production-sample-1920.png`, format: "png", fullPage: true });
  check(
    "no provider request or browser exception",
    providerRequests === 0 && page.consoleErrors.length === 0
  );
} finally {
  await browser.close();
  writeFileSync(
    `${output}/production-browser-checks.json`,
    JSON.stringify(
      {
        condition: "Actual local Next production route; isolated signed sample session and guest auth gate; no AI send or personal files",
        results
      },
      null,
      2
    )
  );
}

console.log(JSON.stringify({ checks: results.length, passed: true }));
process.exit(0);
