import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

assert.ok(process.argv.includes("--allow-live"), "Explicit --allow-live is required; this sends one synthetic request to Gemini.");
const base = "http://127.0.0.1:3034";
const output = "docs/verification/sample-gemini";
mkdirSync(output, { recursive: true });
const checks = [];
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"] });
function check(name, result) { checks.push({ name, passed: !!result }); assert.ok(result, name); }
async function until(page, expression) {
  for (let i = 0; i < 150; i++) {
    if (await page.eval(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Sample AI UI did not reach expected state.");
}
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  let actionRequests = 0;
  browser.on(page.sessionId, "Network.requestWillBeSent", event => { if (event.request.method === "POST" && Object.keys(event.request.headers).some(key => key.toLowerCase() === "next-action")) actionRequests++; });
  await page.send("Network.enable");
  await page.goto(base + "/demo", { settleMs: 200 });
  await until(page, () => !!document.querySelector('[data-sample-ready="true"]'));
  check("AI requires explicit consent", await page.eval(() => document.querySelector('[data-action="sample-ai"]').disabled));
  check("auth session lookup now succeeds without sample login", await page.eval(async () => { const response = await fetch('/api/auth/get-session'); return response.status === 200 && await response.json() === null; }));
  await page.eval(() => document.querySelector('[class*="aiConsent"] input').click());
  check("consent enables selected synthetic sample request", await page.eval(() => !document.querySelector('[data-action="sample-ai"]').disabled));
  const started = performance.now();
  await page.eval(() => document.querySelector('[data-action="sample-ai"]').click());
  await until(page, () => !!document.querySelector('[data-sample-phase="review"]') || document.body.innerText.includes('샘플 안내'));
  const latencyMs = Math.round(performance.now() - started);
  const summary = await page.eval(() => {
    const state = JSON.parse(Object.entries(sessionStorage).find(([key]) => key.startsWith('moa.sample.v1.'))?.[1] ?? 'null');
    return { phase: state?.phase, selected: state?.selected, ai: state?.ai, targets: state?.targets, locations: state?.locations,
      notice: document.querySelector('[data-sample-phase]')?.innerText.includes('샘플 안내') ? document.querySelector('[data-sample-phase]').innerText.slice(0, 800) : null };
  });
  writeFileSync(`${output}/live-result.json`, JSON.stringify({ capturedAt: new Date().toISOString(), buildId: readFileSync('apps/web/.next/BUILD_ID', 'utf8').trim(), latencyMs, actionRequests, ...summary }, null, 2));
  check("real Gemini result reaches review", summary.phase === "review" && summary.ai?.model === "gemini-3.5-flash-lite");
  check("one action request and no automatic retry", actionRequests === 1);
  check("original virtual locations remain unchanged until approval", Object.values(summary.locations).every(location => location === null));
  await page.screenshot({ path: `${output}/review-1440.png`, format: "png", fullPage: true });
  await page.goto(base + "/demo", { settleMs: 200 });
  await until(page, () => !!document.querySelector('[data-sample-phase="review"]'));
  check("refresh retains actual proposal and token usage", await page.eval(() => document.body.innerText.includes('AI 제안') && document.body.innerText.includes('사용 토큰')));
  check("refresh does not repeat a model request", actionRequests === 1);
  await page.setViewport({ width: 390, height: 1000 });
  check("mobile review has no horizontal overflow", await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${output}/review-390.png`, format: "png", fullPage: true });
  console.log(JSON.stringify({ checks, latencyMs, usage: summary.ai.usage }, null, 2));
} finally {
  writeFileSync(`${output}/live-checks.json`, JSON.stringify({ checks }, null, 2));
  await browser.close();
}
